import { checkPin, clearedCookie, sessionCookie } from "@/lib/auth";
import { getState, readPeople } from "@/lib/db";
import { HttpError, json, readJson, route, str } from "@/lib/http";

/** Sign in to a profile (with its PIN, if it has one). */
export const POST = route(async (req: Request) => {
  const b = await readJson(req);
  const id = str(b.id, 64);
  const person = (await readPeople()).people.find((p) => p.id === id);
  if (!person) throw new HttpError("That profile doesn't exist any more.", 404);
  checkPin(person, b.pin);
  return json(await getState(person.id), { headers: { "set-cookie": await sessionCookie(person.id) } });
});

/** Switch profile: forget who's signed in on this browser. */
export const DELETE = route(async () => json({ ok: true }, { headers: { "set-cookie": clearedCookie } }));
