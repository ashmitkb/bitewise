import { requirePerson } from "@/lib/auth";
import { newId, savePhoto, updateAndGetState } from "@/lib/db";
import { HttpError, isoDate, json, mealType, nutrients, oneOf, optionalNum, readJson, route, str } from "@/lib/http";
import { roundNutrients } from "@/lib/nutrition";
import type { FoodEntry, NewEntryItem } from "@/lib/types";

function parseItem(v: unknown): NewEntryItem {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const name = str(o.name, 80);
  if (!name) throw new HttpError("Every item needs a name.");
  const grams = optionalNum(o.grams, 0, 5000, "grams");
  return {
    name,
    portion: str(o.portion, 80),
    grams: grams === null ? null : Math.round(grams),
    per100g: o.per100g ? nutrients(o.per100g, 10000, 1000) : null,
    ...roundNutrients(nutrients(o, 20000, 2000)),
    source: oneOf(o.source ?? "manual", ["text", "photo", "manual"] as const, "source"),
    withPhoto: o.withPhoto === true,
  };
}

/** Add one or more foods to a meal. */
export const POST = route(async (req: Request) => {
  const id = await requirePerson(req);
  const b = await readJson(req);
  const date = isoDate(b.date);
  const meal = mealType(b.meal);
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 30) {
    throw new HttpError("Add between 1 and 30 items.");
  }
  const items = b.items.map(parseItem);
  const photoId =
    typeof b.photo === "string" && b.photo && items.some((i) => i.withPhoto) ? await savePhoto(id, b.photo) : null;
  const createdAt = new Date().toISOString();

  const state = await updateAndGetState(id, (data) => {
    for (const { withPhoto, ...item } of items) {
      const entry: FoodEntry = { id: newId(), date, meal, ...item, photoId: withPhoto ? photoId : null, createdAt };
      data.entries.push(entry);
    }
  });
  return json(state);
});
