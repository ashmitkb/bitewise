import { updateState } from "@/lib/db";
import { isoDate, json, num, readJson, route } from "@/lib/http";
import { round1 } from "@/lib/nutrition";
import { syncProfileWeight, upsertWeight } from "@/lib/state-ops";

export const PUT = route(async (req: Request) => {
  const b = await readJson(req);
  const date = isoDate(b.date);
  const kg = round1(num(b.kg, 20, 400, "Weight (kg)"));
  const state = await updateState((s) => {
    upsertWeight(s, date, kg);
    syncProfileWeight(s);
  });
  return json(state);
});

export const DELETE = route(async (req: Request) => {
  const date = isoDate(new URL(req.url).searchParams.get("date"));
  const state = await updateState((s) => {
    s.weights = s.weights.filter((w) => w.date !== date);
    syncProfileWeight(s);
  });
  return json(state);
});
