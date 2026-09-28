import { HttpError } from "./http";
import type { ModelInfo, Settings } from "./types";

const BASE = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "15m";
/**
 * Context size. By default we leave it to Ollama (4096 tokens), which is plenty here.
 * A bigger context needs more graphics memory: with a game running on an 8 GB card,
 * 8192 made generation ~25x slower. If you do set it, every call uses the same value,
 * because changing num_ctx between requests makes Ollama reload the model.
 */
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || undefined;
const ctxOption = NUM_CTX ? { num_ctx: NUM_CTX } : {};

// Best-first. Anything else you have installed still works; pick it in Settings.
const TEXT_PREFERENCE = [
  "qwen3.5:9b",
  "qwen2.5:14b-instruct-q4_K_M",
  "qwen3:8b",
  "qwen3:4b-instruct-2507-q4_K_M",
  "qwen2.5:7b-instruct-q4_K_M",
  "gemma3:4b",
  "llama3.1:latest",
];
const VISION_PREFERENCE = [
  "qwen3.5:9b",
  "qwen2.5vl:7b",
  "gemma3:4b",
  "llama3.2-vision:latest",
  "minicpm-v:latest",
  "llava:latest",
  "moondream:latest",
];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** base64 images (no data: prefix) */
  images?: string[];
}

const norm = (name: string) => (name.includes(":") ? name : `${name}:latest`);

async function call(pathname: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${pathname}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new HttpError("Can't reach Ollama. Open the Ollama app (or run `ollama serve`) and try again.", 503);
  }
}

async function ollamaError(res: Response, model: string): Promise<HttpError> {
  let detail = "";
  try {
    detail = ((await res.json()) as { error?: string }).error ?? "";
  } catch {
    // no JSON body
  }
  if (res.status === 404 || /not found/i.test(detail)) {
    return new HttpError(`The model "${model}" isn't installed. Run \`ollama pull ${model}\` or pick another model in Settings.`, 404);
  }
  if (/memory|cuda|out of/i.test(detail)) {
    return new HttpError(`Not enough memory to run ${model}. Close GPU-heavy apps (like games) or pick a smaller model in Settings.`, 503);
  }
  return new HttpError(`Ollama error: ${detail || res.status}`, 502);
}

const shared = globalThis as typeof globalThis & { __ollamaCaps?: Map<string, string[]> };
const capCache = (shared.__ollamaCaps ??= new Map());

/** e.g. ["completion", "vision", "thinking"] */
export async function capabilities(model: string): Promise<string[]> {
  const key = norm(model);
  const hit = capCache.get(key);
  if (hit) return hit;
  const res = await call("/api/show", { method: "POST", body: JSON.stringify({ model: key }) });
  if (!res.ok) return [];
  const caps = ((await res.json()) as { capabilities?: string[] }).capabilities ?? ["completion"];
  capCache.set(key, caps);
  return caps;
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await call("/api/tags");
  if (!res.ok) throw new HttpError(`Ollama returned ${res.status}.`, 502);
  const models = ((await res.json()) as { models?: { name: string; size: number }[] }).models ?? [];
  const caps = await Promise.all(models.map((m) => capabilities(m.name)));
  return models
    .map((m, i) => ({ name: m.name, sizeGB: Math.round(m.size / 1e8) / 10, capabilities: caps[i] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadedModels(): Promise<string[]> {
  try {
    const res = await call("/api/ps");
    return (((await res.json()) as { models?: { name: string }[] }).models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

export async function ollamaVersion(): Promise<string | undefined> {
  const res = await call("/api/version");
  return ((await res.json()) as { version?: string }).version;
}

export interface ResolvedModels {
  text: string | null;
  vision: string | null;
  installed: ModelInfo[];
}

/** Settings choice → OLLAMA_*_MODEL env → preference list → anything installed that can do the job. */
export async function resolveModels(settings: Settings): Promise<ResolvedModels> {
  const installed = await listModels();
  const byName = new Map(installed.map((m) => [m.name, m]));
  const canChat = (m: ModelInfo) => m.capabilities.includes("completion");
  const canSee = (m: ModelInfo) => m.capabilities.includes("vision");
  const firstOf = (names: (string | undefined)[], ok: (m: ModelInfo) => boolean) => {
    for (const name of names) {
      const m = name ? byName.get(norm(name)) : undefined;
      if (m && ok(m)) return m.name;
    }
    return installed.find(ok)?.name ?? null;
  };
  return {
    text: firstOf([settings.textModel, process.env.OLLAMA_TEXT_MODEL, ...TEXT_PREFERENCE], canChat),
    vision: firstOf([settings.visionModel, process.env.OLLAMA_VISION_MODEL, ...VISION_PREFERENCE], canSee),
    installed,
  };
}

export async function isLoaded(model: string): Promise<boolean> {
  return (await loadedModels()).includes(norm(model));
}

/** Loads a model into memory ahead of time so the first real request is fast. */
export async function preload(model: string): Promise<void> {
  const res = await call("/api/generate", {
    method: "POST",
    body: JSON.stringify({ model, keep_alive: KEEP_ALIVE, options: ctxOption }),
  });
  await res.text();
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  /** JSON schema: Ollama constrains the output to match it */
  format?: object;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Streams the assistant's reply as text chunks. */
export async function* chatStream(opts: ChatOptions): AsyncGenerator<string> {
  const caps = await capabilities(opts.model);
  const res = await call("/api/chat", {
    method: "POST",
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      keep_alive: KEEP_ALIVE,
      ...(opts.format ? { format: opts.format } : {}),
      // Thinking models (qwen3, qwen3.5…) answer much faster with reasoning switched off,
      // and for estimating food it doesn't make the numbers noticeably better.
      ...(caps.includes("thinking") ? { think: false } : {}),
      options: { temperature: opts.temperature ?? 0.3, num_predict: opts.maxTokens ?? 1024, ...ctxOption },
    }),
  });
  if (!res.ok || !res.body) throw await ollamaError(res, opts.model);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (msg.error) throw new HttpError(`Ollama: ${msg.error}`, 502);
        if (msg.message?.content) yield msg.message.content;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
