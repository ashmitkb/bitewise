import { readState } from "@/lib/db";
import { HttpError, errorMessage, readJson, route, str } from "@/lib/http";
import { sanitizePer100g } from "@/lib/nutrition";
import { chatStream, isLoaded, resolveModels } from "@/lib/ollama";
import { FOOD_SCHEMA, foodMessages, photoMessages } from "@/lib/prompts";
import type { AnalyzeEvent, FoodDraft } from "@/lib/types";

function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}

function toDrafts(raw: string): FoodDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError("The AI's answer came back garbled. Please try again.", 502);
  }
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.slice(0, 30).flatMap((item): FoodDraft[] => {
    const o = (item ?? {}) as Record<string, unknown>;
    const name = str(o.name, 80);
    if (!name) return [];
    const per = (o.per100g ?? {}) as Record<string, unknown>;
    const grams = Number(o.grams);
    const confidence = o.confidence === "high" || o.confidence === "low" ? o.confidence : "medium";
    return [
      {
        key: crypto.randomUUID(),
        name: name.charAt(0).toUpperCase() + name.slice(1),
        portion: str(o.portion, 80),
        grams: Number.isFinite(grams) && grams > 0 ? Math.min(Math.max(Math.round(grams), 1), 3000) : 100,
        per100g: sanitizePer100g({
          calories: Number(per.calories),
          protein: Number(per.protein),
          carbs: Number(per.carbs),
          fat: Number(per.fat),
        }),
        confidence,
      },
    ];
  });
}

/**
 * Turns a meal description or photo into editable food items.
 * Streams newline-delimited JSON events so the UI can show progress (see AnalyzeEvent).
 */
export const POST = route(async (req: Request) => {
  const b = await readJson(req);
  const text = str(b.text, 1000);
  let image = "";
  if (typeof b.image === "string" && b.image) {
    const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.image);
    if (!match) throw new HttpError("The photo must be a JPEG, PNG or WebP image.");
    if (match[1].length > 12_000_000) throw new HttpError("That photo is too large.");
    image = match[1];
  }
  if (!text && !image) throw new HttpError("Describe what you ate or add a photo.");

  const models = await resolveModels((await readState()).settings);
  const model = image ? models.vision : models.text;
  if (!model) {
    throw new HttpError(
      image
        ? "None of your installed models can read photos. Run `ollama pull qwen2.5vl:7b`, or describe the meal in words."
        : "No chat model is installed. Run `ollama pull qwen3.5:9b`.",
      503,
    );
  }
  const messages = image ? photoMessages(image, text) : foodMessages(text);
  const warm = await isLoaded(model);
  const working = image ? "Looking at your photo…" : "Reading your meal…";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalyzeEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // client went away
        }
      };
      try {
        send({ type: "status", message: warm ? working : `Loading ${model} into memory. The first run can take a minute…` });
        let out = "";
        let namesSent = 0;
        let started = warm;
        for await (const chunk of chatStream({
          model,
          messages,
          format: FOOD_SCHEMA,
          temperature: 0.2,
          maxTokens: 1500,
          signal: req.signal,
        })) {
          if (!started) {
            send({ type: "status", message: working });
            started = true;
          }
          out += chunk;
          // Show food names as soon as the model writes them.
          const names = [...out.matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => unescapeJson(m[1]));
          if (names.length > namesSent) {
            namesSent = names.length;
            send({ type: "found", names });
          }
        }
        send({ type: "result", items: toDrafts(out), model });
      } catch (err) {
        send({ type: "error", message: errorMessage(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
});
