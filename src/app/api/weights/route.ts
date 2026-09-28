import { requirePerson } from "@/lib/auth";
import { updateAndGetState } from "@/lib/db";
import { isoDate, json, num, readJson, route } from "@/lib/http";
import { round1 } from "@/lib/nutrition";
import { syncProfileWeight, upsertWeight } from "@/lib/state-ops";

export const PUT = route(async (req: Request) => {
  const id = await requirePerson(req);
  const b = await readJson(req);
  const date = isoDate(b.date);
  const kg = round1(num(b.kg, 20, 400, "Weight (kg)"));
  const state = await updateAndGetState(id, (data) => {
    upsertWeight(data, date, kg);
    syncProfileWeight(data);
  });
  return json(state);
});

export const DELETE = route(async (req: Request) => {
  const id = await requirePerson(req);
  const date = isoDate(new URL(req.url).searchParams.get("date"));
  const state = await updateAndGetState(id, (data) => {
    data.weights = data.weights.filter((w) => w.date !== date);
    syncProfileWeight(data);
  });
  return json(state);
});
