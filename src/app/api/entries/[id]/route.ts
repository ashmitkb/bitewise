import { deletePhoto, updateState } from "@/lib/db";
import { HttpError, isoDate, json, mealType, nutrients, optionalNum, readJson, route, str } from "@/lib/http";
import { roundNutrients } from "@/lib/nutrition";

export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/entries/[id]">) => {
  const { id } = await ctx.params;
  const b = await readJson(req);

  const state = await updateState((s) => {
    const entry = s.entries.find((e) => e.id === id);
    if (!entry) throw new HttpError("That entry no longer exists.", 404);
    if (b.name !== undefined) {
      const name = str(b.name, 80);
      if (!name) throw new HttpError("Name can't be empty.");
      entry.name = name;
    }
    if (b.portion !== undefined) entry.portion = str(b.portion, 80);
    if (b.meal !== undefined) entry.meal = mealType(b.meal);
    if (b.date !== undefined) entry.date = isoDate(b.date);
    if (b.grams !== undefined) {
      const grams = optionalNum(b.grams, 0, 5000, "grams");
      entry.grams = grams === null ? null : Math.round(grams);
    }
    if (b.per100g !== undefined) entry.per100g = b.per100g ? nutrients(b.per100g, 10000, 1000) : null;
    if (b.calories !== undefined) Object.assign(entry, roundNutrients(nutrients(b, 20000, 2000)));
  });
  return json(state);
});

export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/entries/[id]">) => {
  const { id } = await ctx.params;
  const removed: { photoId: string | null } = { photoId: null };

  const state = await updateState((s) => {
    const entry = s.entries.find((e) => e.id === id);
    if (!entry) throw new HttpError("That entry no longer exists.", 404);
    s.entries = s.entries.filter((e) => e.id !== id);
    // A photo can be shared by several items from the same meal; drop it with the last one.
    if (entry.photoId && !s.entries.some((e) => e.photoId === entry.photoId)) removed.photoId = entry.photoId;
  });
  if (removed.photoId) await deletePhoto(removed.photoId);
  return json(state);
});
