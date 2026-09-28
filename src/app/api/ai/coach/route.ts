import { readState } from "@/lib/db";
import { HttpError, errorMessage, isoDate, readJson, route, str } from "@/lib/http";
import { chatStream, isLoaded, resolveModels, type ChatMessage } from "@/lib/ollama";
import { coachSystemPrompt } from "@/lib/prompts";
import type { CoachEvent } from "@/lib/types";

/** Recent messages only, so the conversation plus your food log fit in the model's 4K-token context. */
const HISTORY_CHARS = 6000;

function parseHistory(v: unknown): ChatMessage[] {
  if (!Array.isArray(v)) throw new HttpError("messages must be an array.");
  const all = v
    .map((m): ChatMessage => {
      const o = (m ?? {}) as Record<string, unknown>;
      return { role: o.role === "assistant" ? "assistant" : "user", content: str(o.content, 2000) };
    })
    .filter((m) => m.content);
  if (all.at(-1)?.role !== "user") throw new HttpError("The last message must be yours.");

  const kept: ChatMessage[] = [];
  let chars = 0;
  for (let i = all.length - 1; i >= 0 && kept.length < 12; i--) {
    chars += all[i].content.length;
    if (chars > HISTORY_CHARS && kept.length > 0) break;
    kept.unshift(all[i]);
  }
  return kept;
}

/** Chat with the coach. Streams newline-delimited JSON events (see CoachEvent). */
export const POST = route(async (req: Request) => {
  const b = await readJson(req);
  const date = isoDate(b.date);
  const history = parseHistory(b.messages);
  const state = await readState();
  if (!state.profile) throw new HttpError("Set up your profile first.");

  const { text: model } = await resolveModels(state.settings);
  if (!model) throw new HttpError("No chat model is installed. Run `ollama pull qwen3.5:9b`.", 503);
  const warm = await isLoaded(model);
  const messages: ChatMessage[] = [{ role: "system", content: coachSystemPrompt(state, date) }, ...history];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CoachEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // client went away
        }
      };
      try {
        if (!warm) send({ type: "status", message: `Loading ${model} into memory…` });
        for await (const text of chatStream({ model, messages, temperature: 0.7, maxTokens: 1200, signal: req.signal })) {
          send({ type: "delta", text });
        }
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
