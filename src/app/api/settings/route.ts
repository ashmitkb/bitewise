import { updateState } from "@/lib/db";
import { json, readJson, route, str } from "@/lib/http";

export const PUT = route(async (req: Request) => {
  const b = await readJson(req);
  const state = await updateState((s) => {
    if (b.textModel !== undefined) s.settings.textModel = str(b.textModel, 120);
    if (b.visionModel !== undefined) s.settings.visionModel = str(b.visionModel, 120);
  });
  return json(state);
});
