import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http";
import type { AppState } from "./types";

/**
 * Storage is a single JSON file (data/diet.json) plus meal photo thumbnails in data/photos.
 * Plenty for one person's food log, easy to back up, and readable in any editor.
 */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "diet.json");
const PHOTO_DIR = path.join(DATA_DIR, "photos");

// Route handlers can be bundled separately, so the write queue lives on globalThis
// to serialize writes across all of them in this server process.
const shared = globalThis as typeof globalThis & { __dietWriteQueue?: Promise<unknown> };

export function emptyState(): AppState {
  return {
    version: 1,
    profile: null,
    settings: { textModel: "", visionModel: "" },
    entries: [],
    weights: [],
    water: {},
  };
}

function normalize(raw: Partial<AppState>): AppState {
  const base = emptyState();
  return {
    version: 1,
    profile: raw.profile ?? null,
    settings: { ...base.settings, ...raw.settings },
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    weights: Array.isArray(raw.weights) ? raw.weights : [],
    water: raw.water && typeof raw.water === "object" ? raw.water : {},
  };
}

export async function readState(): Promise<AppState> {
  try {
    return normalize(JSON.parse(await fs.readFile(DB_FILE, "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function writeState(state: AppState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 1), "utf8");
  // Write-then-rename so a crash never leaves a half-written file.
  // Windows can briefly lock the target (antivirus, indexer), so retry a few times.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, DB_FILE);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt < 6 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await sleep(50 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

/** Read-modify-write, one at a time. Returns the saved state. */
export function updateState(mutator: (state: AppState) => void | Promise<void>): Promise<AppState> {
  const run = (shared.__dietWriteQueue ?? Promise.resolve()).then(async () => {
    const state = await readState();
    await mutator(state);
    await writeState(state);
    return state;
  });
  shared.__dietWriteQueue = run.catch(() => undefined);
  return run;
}

export async function replaceState(next: AppState): Promise<AppState> {
  return updateState((state) => {
    Object.assign(state, normalize(next));
  });
}

export const newId = () => randomUUID();

// ---- photos

const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isPhotoId(id: string): boolean {
  return PHOTO_ID.test(id);
}

/** Saves a JPEG data URL (the small thumbnail the browser made) and returns its id. */
export async function savePhoto(dataUrl: string): Promise<string> {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new HttpError("Photo must be a JPEG data URL.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 1_500_000) throw new HttpError("Photo thumbnail is too large.");
  const id = randomUUID();
  await fs.mkdir(PHOTO_DIR, { recursive: true });
  await fs.writeFile(path.join(PHOTO_DIR, `${id}.jpg`), bytes);
  return id;
}

export async function readPhoto(id: string): Promise<Buffer | null> {
  if (!isPhotoId(id)) return null;
  try {
    return await fs.readFile(path.join(PHOTO_DIR, `${id}.jpg`));
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  if (!isPhotoId(id)) return;
  await fs.rm(path.join(PHOTO_DIR, `${id}.jpg`), { force: true });
}

export async function deleteAllPhotos(): Promise<void> {
  await fs.rm(PHOTO_DIR, { recursive: true, force: true });
}
