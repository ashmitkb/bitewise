import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSecret, readPeople } from "./db";
import { HttpError } from "./http";
import type { Person } from "./types";

/**
 * Profiles with an optional PIN, so a few people (you and a friend) can share one computer's
 * Bitewise without seeing each other's logs. It keeps honest people out of each other's
 * profile; it isn't meant to protect the app on the open internet.
 *
 * Signing in sets an HttpOnly cookie "<personId>.<expiry>.<signature>", signed with a
 * random secret stored in data/secret.key.
 */
const COOKIE = "bw_session";
const MAX_AGE_DAYS = 180;

// ---------------------------------------------------------------- PINs

export function validPin(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4,8}$/.test(v)) throw new HttpError("The PIN must be 4 to 8 digits.");
  return v;
}

/** PINs are stored as salted scrypt hashes, never as the digits themselves. */
export function hashPin(pin: string): NonNullable<Person["pin"]> {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(pin, salt, 32).toString("hex") };
}

function pinMatches(pin: unknown, stored: NonNullable<Person["pin"]>): boolean {
  if (typeof pin !== "string") return false;
  const actual = scryptSync(pin, stored.salt, 32);
  const expected = Buffer.from(stored.hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Slow down PIN guessing: after 5 wrong tries the profile locks for 1 minute, then longer.
const shared = globalThis as typeof globalThis & { __pinAttempts?: Map<string, { fails: number; until: number }> };
const attempts = (shared.__pinAttempts ??= new Map());

/** Throws unless `pin` is right (or the person has no PIN). */
export function checkPin(person: Person, pin: unknown): void {
  if (!person.pin) return;
  const record = attempts.get(person.id) ?? { fails: 0, until: 0 };
  const wait = record.until - Date.now();
  if (wait > 0) throw new HttpError(`Too many wrong PINs. Try again in ${Math.ceil(wait / 1000)} seconds.`, 429);
  if (!pinMatches(pin, person.pin)) {
    record.fails++;
    if (record.fails >= 5) record.until = Date.now() + 60_000 * Math.min(2 ** (record.fails - 5), 30);
    attempts.set(person.id, record);
    throw new HttpError("Wrong PIN.", 401);
  }
  attempts.delete(person.id);
}

// ---------------------------------------------------------------- session cookie

async function sign(value: string): Promise<string> {
  return createHmac("sha256", await getSecret()).update(value).digest("base64url");
}

export async function sessionCookie(personId: string): Promise<string> {
  const value = `${personId}.${Date.now() + MAX_AGE_DAYS * 86_400_000}`;
  // No "Secure" flag: at home the app is served over plain http.
  return `${COOKIE}=${value}.${await sign(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_DAYS * 86_400}`;
}

export const clearedCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** The signed-in person's id, or null. */
export async function sessionPersonId(req: Request): Promise<string | null> {
  const token = (req.headers.get("cookie") ?? "")
    .split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [id, expiry, signature] = token.split(".");
  if (!id || !expiry || !signature || Number(expiry) < Date.now()) return null;
  const expected = Buffer.from(await sign(`${id}.${expiry}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  // A deleted profile's cookie stops working.
  return (await readPeople()).people.some((p) => p.id === id) ? id : null;
}

export async function requirePerson(req: Request): Promise<string> {
  const id = await sessionPersonId(req);
  if (!id) throw new HttpError("Choose your profile first.", 401);
  return id;
}
