import { checkPin, hashPin, requirePerson, validPin } from "@/lib/auth";
import { getState, updatePeople } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";

/** Set, change or remove your PIN. Changing or removing needs the current one. */
export const PUT = route(async (req: Request) => {
  const id = await requirePerson(req);
  const b = await readJson(req);
  const next = b.pin === null ? null : validPin(b.pin);

  await updatePeople((file) => {
    const person = file.people.find((p) => p.id === id);
    if (!person) throw new HttpError("That profile no longer exists.", 401);
    checkPin(person, b.currentPin);
    if (!next && file.people.length > 1) throw new HttpError("Keep a PIN while other people use this app too.");
    person.pin = next ? hashPin(next) : null;
  });
  return json(await getState(id));
});
