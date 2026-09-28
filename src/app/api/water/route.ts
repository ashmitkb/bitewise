import { requirePerson } from "@/lib/auth";
import { updateAndGetState } from "@/lib/db";
import { isoDate, json, num, readJson, route } from "@/lib/http";

export const PUT = route(async (req: Request) => {
  const id = await requirePerson(req);
  const b = await readJson(req);
  const date = isoDate(b.date);
  const glasses = Math.round(num(b.glasses, 0, 40, "Glasses"));
  const state = await updateAndGetState(id, (data) => {
    if (glasses === 0) delete data.water[date];
    else data.water[date] = glasses;
  });
  return json(state);
});
