import { requirePerson } from "@/lib/auth";
import { readPeople } from "@/lib/db";
import { json, oneOf, readJson, route } from "@/lib/http";
import { isLoaded, preload, resolveModels } from "@/lib/ollama";

/**
 * Called when you open the "add food" sheet or the coach, so the model is already
 * in memory by the time you've typed your meal. Returns immediately.
 */
export const POST = route(async (req: Request) => {
  await requirePerson(req);
  const b = await readJson(req);
  const kind = oneOf(b.kind ?? "text", ["text", "vision"] as const, "kind");
  const models = await resolveModels((await readPeople()).settings);
  const model = kind === "vision" ? models.vision : models.text;
  if (!model) return json({ model: null, loaded: false });
  const loaded = await isLoaded(model);
  if (!loaded) void preload(model).catch(() => undefined);
  return json({ model, loaded });
});
