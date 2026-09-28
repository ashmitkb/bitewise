import type { MealType, Nutrients } from "./types";
import { MEALS } from "./types";

/** Error with an HTTP status and a message that is safe to show in the UI. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
}

export function errorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error && err.name === "AbortError") return "Cancelled.";
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export function errorResponse(err: unknown): Response {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error(err);
  return json({ error: errorMessage(err) }, { status });
}

/** Wraps a route handler so thrown HttpErrors become JSON error responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError("Request body must be a JSON object.");
}

// ---- tiny validators (the API is only reachable on your own network, but bad input shouldn't corrupt the data file)

export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function num(v: unknown, min: number, max: number, field = "value"): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(`${field} must be a number between ${min} and ${max}.`);
  return n;
}

export function optionalNum(v: unknown, min: number, max: number, field = "value"): number | null {
  return v === null || v === undefined || v === "" ? null : num(v, min, max, field);
}

export function isoDate(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return v;
  throw new HttpError("Date must look like YYYY-MM-DD.");
}

export function oneOf<T extends string>(v: unknown, options: readonly T[], field = "value"): T {
  if (typeof v === "string" && (options as readonly string[]).includes(v)) return v as T;
  throw new HttpError(`${field} must be one of: ${options.join(", ")}.`);
}

export function mealType(v: unknown): MealType {
  return oneOf(
    v,
    MEALS.map((m) => m.id),
    "meal",
  );
}

export function nutrients(v: unknown, maxCalories = 10000, maxGrams = 1000): Nutrients {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    calories: num(o.calories ?? 0, 0, maxCalories, "calories"),
    protein: num(o.protein ?? 0, 0, maxGrams, "protein"),
    carbs: num(o.carbs ?? 0, 0, maxGrams, "carbs"),
    fat: num(o.fat ?? 0, 0, maxGrams, "fat"),
  };
}
