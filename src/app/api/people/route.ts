import { hashPin, sessionCookie, validPin } from "@/lib/auth";
import { createPerson, getState, readPeople, summary } from "@/lib/db";
import { HttpError, json, readJson, route, str } from "@/lib/http";

/** The profiles on this computer, for the "Who's using Bitewise?" screen (names only). */
export const GET = route(async () => json((await readPeople()).people.map(summary)));

/** Add a profile and sign in as it. */
export const POST = route(async (req: Request) => {
  const b = await readJson(req);
  const name = str(b.name, 30);
  if (!name) throw new HttpError("Enter a name for the profile.");
  const { people } = await readPeople();
  if (people.length >= 12) throw new HttpError("That's the maximum number of profiles. Delete one first.");
  if (people.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new HttpError("There's already a profile with that name.");
  // The first profile may skip the PIN; once people share the app, every new profile needs one.
  const pin = b.pin ? validPin(b.pin) : null;
  if (!pin && people.length > 0) throw new HttpError("Choose a PIN (4 to 8 digits) so others using this app can't open your profile.");

  const person = await createPerson(name, pin ? hashPin(pin) : null);
  return json(await getState(person.id), { headers: { "set-cookie": await sessionCookie(person.id) } });
});
