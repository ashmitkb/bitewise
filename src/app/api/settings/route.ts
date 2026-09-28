import { requirePerson } from "@/lib/auth";
import { getState, updatePeople } from "@/lib/db";
import { json, readJson, route, str } from "@/lib/http";

/** Model choices belong to the computer, so they're shared by every profile. */
export const PUT = route(async (req: Request) => {
  const id = await requirePerson(req);
  const b = await readJson(req);
  await updatePeople((file) => {
    if (b.textModel !== undefined) file.settings.textModel = str(b.textModel, 120);
    if (b.visionModel !== undefined) file.settings.visionModel = str(b.visionModel, 120);
  });
  return json(await getState(id));
});
