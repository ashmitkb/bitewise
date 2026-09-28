import { readPhoto } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const bytes = await readPhoto(id);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      // ids are random and photos never change, so the browser can keep them forever
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
