import { updateState } from "@/lib/db";
import { isoDate, json, num, readJson, route } from "@/lib/http";

export const PUT = route(async (req: Request) => {
  const b = await readJson(req);
  const date = isoDate(b.date);
  const glasses = Math.round(num(b.glasses, 0, 40, "Glasses"));
  const state = await updateState((s) => {
    if (glasses === 0) delete s.water[date];
    else s.water[date] = glasses;
  });
  return json(state);
});
