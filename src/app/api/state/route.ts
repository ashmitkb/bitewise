import { readState } from "@/lib/db";
import { json, route } from "@/lib/http";

export const GET = route(async () => json(await readState()));
