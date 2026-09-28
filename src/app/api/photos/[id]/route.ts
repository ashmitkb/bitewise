import { sessionPersonId } from "@/lib/auth";
import { readPhoto } from "@/lib/db";

export async function GET(req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const personId = await sessionPersonId(req);
  const { id } = await ctx.params;
  // Only the owner's own photos, so profiles can't peek at each other's meals.
  const bytes = personId ? await readPhoto(personId, id) : null;
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      // ids are random and photos never change, so the browser can keep them
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
