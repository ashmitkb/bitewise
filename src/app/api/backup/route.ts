import { clearedCookie, requirePerson } from "@/lib/auth";
import { deletePerson, isId, readUserData, updateAndGetState } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { HttpError, json, readJson, route } from "@/lib/http";
import type { FoodEntry, Profile, WeightEntry } from "@/lib/types";
import { MEALS } from "@/lib/types";

/** Download your own data as one JSON file (photos aren't included). */
export const GET = route(async (req: Request) => {
  const id = await requirePerson(req);
  const data = await readUserData(id);
  return new Response(JSON.stringify({ app: "bitewise", version: 2, exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="bitewise-backup-${todayISO()}.json"`,
      "cache-control": "no-store",
    },
  });
});

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function validProfile(v: unknown): v is Profile {
  const p = v as Profile;
  return (
    !!p &&
    (p.sex === "male" || p.sex === "female") &&
    [p.age, p.heightCm, p.weightKg, p.pace, p.waterGoal].every(isNum) &&
    typeof p.activity === "string" &&
    typeof p.goal === "string" &&
    !!p.targets &&
    [p.targets.calories, p.targets.protein, p.targets.carbs, p.targets.fat].every(isNum)
  );
}

function validEntry(v: unknown): v is FoodEntry {
  const e = v as FoodEntry;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    isDate(e.date) &&
    MEALS.some((m) => m.id === e.meal) &&
    [e.calories, e.protein, e.carbs, e.fat].every(isNum)
  );
}

/** Restore your data from a backup file (from either app version), replacing what's in your profile. */
export const POST = route(async (req: Request) => {
  const id = await requirePerson(req);
  const b = await readJson(req);
  if ((b.version !== 1 && b.version !== 2) || !Array.isArray(b.entries) || !Array.isArray(b.weights)) {
    throw new HttpError("That file doesn't look like a Bitewise backup.");
  }
  const entries = (b.entries as unknown[]).filter(validEntry).map((e) => ({
    ...e,
    portion: typeof e.portion === "string" ? e.portion : "",
    grams: isNum(e.grams) ? e.grams : null,
    per100g: e.per100g && [e.per100g.calories, e.per100g.protein, e.per100g.carbs, e.per100g.fat].every(isNum) ? e.per100g : null,
    // photos aren't in backups; keep the link only in case the file is still on this computer
    photoId: typeof e.photoId === "string" && isId(e.photoId) ? e.photoId : null,
    source: e.source ?? "manual",
  }));
  const weights = (b.weights as WeightEntry[]).filter((w) => w && isDate(w.date) && isNum(w.kg));
  const water = Object.fromEntries(
    Object.entries((b.water ?? {}) as Record<string, unknown>).filter(([d, n]) => isDate(d) && isNum(n)),
  ) as Record<string, number>;
  const profile = validProfile(b.profile)
    ? {
        ...b.profile,
        name: typeof b.profile.name === "string" ? b.profile.name : "",
        dietNotes: typeof b.profile.dietNotes === "string" ? b.profile.dietNotes : "",
        customTargets: b.profile.customTargets === true,
      }
    : null;

  const state = await updateAndGetState(id, (data) => {
    data.profile = profile;
    data.entries = entries;
    data.weights = weights.sort((x, y) => x.date.localeCompare(y.date));
    data.water = water;
  });
  return json(state);
});

/** Delete your profile with all its data and photos. Other people's profiles aren't touched. */
export const DELETE = route(async (req: Request) => {
  const id = await requirePerson(req);
  await deletePerson(id);
  return json({ ok: true }, { headers: { "set-cookie": clearedCookie } });
});
