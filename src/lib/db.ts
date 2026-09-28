import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { HttpError } from "./http";
import type { AppState, Person, PersonSummary, Settings, UserData } from "./types";

/**
 * Storage layout, all inside data/ (or DATA_DIR):
 *   people.json               who uses the app, plus shared settings (AI models)
 *   secret.key                signs the login cookies
 *   users/<id>/data.json      one person's profile, food log, weigh-ins and water
 *   users/<id>/photos/*.jpg   that person's meal photo thumbnails
 * Plain JSON: plenty for a few people's food logs, easy to back up, readable in any editor.
 *
 * The first version kept a single person's data in diet.json. It's moved into a
 * profile automatically on first start and the old file is kept as diet.v1-backup.json.
 */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const PEOPLE_FILE = path.join(DATA_DIR, "people.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const LEGACY_FILE = path.join(DATA_DIR, "diet.json");
const LEGACY_PHOTOS = path.join(DATA_DIR, "photos");

export interface PeopleFile {
  version: 2;
  people: Person[];
  settings: Settings;
}

// Route handlers can be bundled separately, so shared state lives on globalThis.
const shared = globalThis as typeof globalThis & {
  __dietWriteQueue?: Promise<unknown>;
  __dietMigration?: Promise<void>;
  __dietSecret?: Promise<Buffer>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isId = (id: string) => UUID.test(id);
export const newId = () => randomUUID();

function userDir(id: string): string {
  if (!isId(id)) throw new HttpError("Unknown profile.", 404);
  return path.join(DATA_DIR, "users", id);
}
const userFile = (id: string) => path.join(userDir(id), "data.json");
const photoDir = (id: string) => path.join(userDir(id), "photos");

export function emptyUserData(): UserData {
  return { profile: null, entries: [], weights: [], water: {} };
}

const defaultSettings = (): Settings => ({ textModel: "", visionModel: "" });

function normalizeUserData(raw: Partial<UserData> | null): UserData {
  return {
    profile: raw?.profile ?? null,
    entries: Array.isArray(raw?.entries) ? raw.entries : [],
    weights: Array.isArray(raw?.weights) ? raw.weights : [],
    water: raw?.water && typeof raw.water === "object" ? raw.water : {},
  };
}

export const summary = (p: Person): PersonSummary => ({ id: p.id, name: p.name, hasPin: !!p.pin });

// ---------------------------------------------------------------- file helpers

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 1), "utf8");
  // Write-then-rename so a crash never leaves a half-written file.
  // Windows can briefly lock the target (antivirus, indexer), so retry a few times.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt < 6 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await sleep(50 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

/** Runs writes one at a time across the whole server process. */
function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = (shared.__dietWriteQueue ?? Promise.resolve()).then(task);
  shared.__dietWriteQueue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------- migration from the single-person version

async function migrateLegacy(): Promise<void> {
  const legacy = await readJson<Partial<UserData> & { settings?: Settings }>(LEGACY_FILE);
  if (!legacy) return;
  const data = normalizeUserData(legacy);
  const people: Person[] = [];
  const hasData = data.profile !== null || data.entries.length > 0 || data.weights.length > 0;
  if (hasData) {
    const id = newId();
    try {
      await fs.cp(LEGACY_PHOTOS, photoDir(id), { recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    await writeJson(userFile(id), data);
    people.push({ id, name: data.profile?.name?.trim() || "Me", pin: null, createdAt: new Date().toISOString() });
  }
  await writeJson(PEOPLE_FILE, { version: 2, people, settings: { ...defaultSettings(), ...legacy.settings } } satisfies PeopleFile);
  // Keep the originals around rather than deleting anything.
  await fs.rename(LEGACY_FILE, path.join(DATA_DIR, "diet.v1-backup.json"));
  if (await exists(LEGACY_PHOTOS)) await fs.rename(LEGACY_PHOTOS, path.join(DATA_DIR, "photos.v1-backup"));
}

/** Must run before anything else touches the files. Never call it from inside `queued`. */
function ensureMigrated(): Promise<void> {
  shared.__dietMigration ??= queued(async () => {
    if (await exists(PEOPLE_FILE)) return;
    if (await exists(LEGACY_FILE)) await migrateLegacy();
  }).catch((err) => {
    shared.__dietMigration = undefined;
    throw err;
  });
  return shared.__dietMigration;
}

// ---------------------------------------------------------------- people

async function rawReadPeople(): Promise<PeopleFile> {
  const raw = await readJson<Partial<PeopleFile>>(PEOPLE_FILE);
  return {
    version: 2,
    people: Array.isArray(raw?.people) ? raw.people : [],
    settings: { ...defaultSettings(), ...raw?.settings },
  };
}

export async function readPeople(): Promise<PeopleFile> {
  await ensureMigrated();
  return rawReadPeople();
}

export async function updatePeople(mutator: (file: PeopleFile) => void | Promise<void>): Promise<PeopleFile> {
  await ensureMigrated();
  return queued(async () => {
    const file = await rawReadPeople();
    await mutator(file);
    await writeJson(PEOPLE_FILE, file);
    return file;
  });
}

export async function createPerson(name: string, pin: Person["pin"]): Promise<Person> {
  const person: Person = { id: newId(), name, pin, createdAt: new Date().toISOString() };
  await updatePeople((file) => {
    file.people.push(person);
  });
  await queued(() => writeJson(userFile(person.id), emptyUserData()));
  return person;
}

export async function deletePerson(id: string): Promise<void> {
  const dir = userDir(id);
  await updatePeople((file) => {
    file.people = file.people.filter((p) => p.id !== id);
  });
  await queued(() => fs.rm(dir, { recursive: true, force: true }));
}

// ---------------------------------------------------------------- one person's data

export async function readUserData(id: string): Promise<UserData> {
  await ensureMigrated();
  return normalizeUserData(await readJson<UserData>(userFile(id)));
}

/** Read-modify-write of one person's data, one write at a time. */
export async function updateUserData(id: string, mutator: (data: UserData) => void | Promise<void>): Promise<UserData> {
  await ensureMigrated();
  const file = userFile(id);
  return queued(async () => {
    const data = normalizeUserData(await readJson<UserData>(file));
    await mutator(data);
    await writeJson(file, data);
    return data;
  });
}

/** Everything the signed-in person's browser needs. */
export async function getState(id: string): Promise<AppState> {
  const [file, data] = await Promise.all([readPeople(), readUserData(id)]);
  const me = file.people.find((p) => p.id === id);
  if (!me) throw new HttpError("That profile no longer exists.", 401);
  return { version: 2, me: summary(me), peopleCount: file.people.length, settings: file.settings, ...data };
}

/** Change one person's data and return their fresh state (what every edit endpoint responds with). */
export async function updateAndGetState(id: string, mutator: (data: UserData) => void | Promise<void>): Promise<AppState> {
  await updateUserData(id, mutator);
  return getState(id);
}

// ---------------------------------------------------------------- login cookie secret

export function getSecret(): Promise<Buffer> {
  shared.__dietSecret ??= (async () => {
    await ensureMigrated();
    const existing = await readJson<string>(SECRET_FILE).catch(() => null);
    if (typeof existing === "string" && existing.length >= 64) return Buffer.from(existing, "hex");
    const secret = randomBytes(32);
    await queued(() => writeJson(SECRET_FILE, secret.toString("hex")));
    return secret;
  })().catch((err) => {
    shared.__dietSecret = undefined;
    throw err;
  });
  return shared.__dietSecret;
}

// ---------------------------------------------------------------- photos

/** Saves a JPEG data URL (the small thumbnail the browser made) and returns its id. */
export async function savePhoto(userId: string, dataUrl: string): Promise<string> {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new HttpError("Photo must be a JPEG data URL.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 1_500_000) throw new HttpError("Photo thumbnail is too large.");
  const id = newId();
  await fs.mkdir(photoDir(userId), { recursive: true });
  await fs.writeFile(path.join(photoDir(userId), `${id}.jpg`), bytes);
  return id;
}

export async function readPhoto(userId: string, id: string): Promise<Buffer | null> {
  if (!isId(id)) return null;
  try {
    return await fs.readFile(path.join(photoDir(userId), `${id}.jpg`));
  } catch {
    return null;
  }
}

export async function deletePhoto(userId: string, id: string): Promise<void> {
  if (!isId(id)) return;
  await fs.rm(path.join(photoDir(userId), `${id}.jpg`), { force: true });
}
