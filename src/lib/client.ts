"use client";

/** An API error that keeps the HTTP status (401 means "choose your profile"). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** JSON fetch helper for our own API. Throws the server's error message on failure. */
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: options.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

/**
 * POST to a streaming endpoint and call onEvent for every newline-delimited JSON event.
 * Errors before the stream starts (offline, bad input) come back as a normal JSON error.
 */
export async function streamEvents<E>(path: string, body: unknown, onEvent: (event: E) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as E);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as E);
}

/**
 * Shrinks a photo in the browser before upload: big phone photos are 3–12 MB,
 * the model only needs ~1000px, and uploads over Wi-Fi get much faster.
 */
export async function imageToJpeg(file: Blob, maxSide: number, quality = 0.85): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't read that image format. Try a JPEG or PNG photo.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

/** crypto.randomUUID() only exists on https/localhost, and phones open the app over plain http on Wi-Fi. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ToastDetail {
  message: string;
  tone?: "default" | "error";
}

export function toast(message: string, tone: ToastDetail["tone"] = "default") {
  window.dispatchEvent(new CustomEvent<ToastDetail>("app-toast", { detail: { message, tone } }));
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked; not critical
  }
}
