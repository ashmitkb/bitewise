import { sessionCookie, sessionPersonId } from "@/lib/auth";
import { getState, readPeople } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";

export const GET = route(async (req: Request) => {
  const id = await sessionPersonId(req);
  if (id) return json(await getState(id));

  const { people } = await readPeople();
  // A single profile without a PIN has nothing to protect: sign straight in,
  // so using Bitewise alone works exactly like before profiles existed.
  if (people.length === 1 && !people[0].pin) {
    return json(await getState(people[0].id), { headers: { "set-cookie": await sessionCookie(people[0].id) } });
  }
  throw new HttpError(people.length ? "Choose your profile." : "Create your profile.", 401);
});
