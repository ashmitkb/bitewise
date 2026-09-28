"use client";

import { useState } from "react";
import { errorText, toast } from "@/lib/client";
import { todayISO } from "@/lib/dates";
import type { AiStatus, Settings } from "@/lib/types";
import { ProfileForm } from "../ProfileForm";
import { useAppState, useStore } from "../StoreProvider";
import { useAiStatus } from "../useAiStatus";

export function SettingsView() {
  const state = useAppState();
  const { saveProfile } = useStore();
  const { status, refresh } = useAiStatus();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <section aria-labelledby="profile-title" className="card p-5 sm:p-6">
        <h2 id="profile-title" className="mb-4 text-lg font-semibold">
          Profile &amp; targets
        </h2>
        <ProfileForm
          initial={state.profile}
          submitLabel="Save changes"
          onSubmit={async (profile) => {
            await saveProfile(profile, todayISO());
            toast("Profile saved");
          }}
        />
      </section>

      <section aria-labelledby="ai-title" className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="ai-title" className="text-lg font-semibold">
            AI models
          </h2>
          <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        <AiModels status={status} settings={state.settings} onChanged={refresh} />
      </section>

      <section aria-labelledby="phone-title" className="card p-5 sm:p-6">
        <h2 id="phone-title" className="mb-2 text-lg font-semibold">
          Use it on your phone
        </h2>
        <p className="text-sm text-ink-2">
          With your phone on the same Wi-Fi as this computer, open one of these addresses in its browser. Then you can snap meal photos
          straight from the phone camera.
        </p>
        {status?.lanUrls.length ? (
          <ul className="mt-3 space-y-1">
            {status.lanUrls.map((url) => (
              <li key={url}>
                <code className="rounded-lg bg-surface-2 px-2 py-1 text-sm">{url}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No network connection found.</p>
        )}
        <p className="mt-3 text-xs text-muted">
          If the page doesn&apos;t load, allow Node.js through Windows Firewall on private networks. See the README for running it in
          production mode, which is faster.
        </p>
      </section>

      <DataSection />
    </div>
  );
}

function AiModels({ status, settings, onChanged }: { status: AiStatus | null; settings: Settings; onChanged: () => Promise<void> }) {
  const { saveSettings } = useStore();

  if (!status) return <p className="text-sm text-ink-2">Checking Ollama…</p>;
  if (!status.online) {
    return (
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <span className="size-2.5 rounded-full bg-critical" aria-hidden="true" /> Offline
        </p>
        <p className="text-ink-2">{status.error}</p>
        <p className="text-ink-2">
          Install Ollama from ollama.com, open it, then run <code className="rounded bg-surface-2 px-1">ollama pull qwen3.5:9b</code> in a
          terminal.
        </p>
      </div>
    );
  }

  const chatModels = status.installed.filter((m) => m.capabilities.includes("completion"));
  const visionModels = status.installed.filter((m) => m.capabilities.includes("vision"));

  async function change(patch: Partial<Settings>) {
    try {
      await saveSettings(patch);
      await onChanged();
      toast("Model updated");
    } catch (err) {
      toast(errorText(err), "error");
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <span className="size-2.5 rounded-full bg-good" aria-hidden="true" /> Ollama {status.version} is running
        {status.loaded.length > 0 && <span className="font-normal text-muted">· in memory: {status.loaded.join(", ")}</span>}
      </p>

      <div>
        <label htmlFor="text-model" className="label">
          Model for typed meals and the coach
        </label>
        <select id="text-model" className="field" value={settings.textModel} onChange={(e) => void change({ textModel: e.target.value })}>
          <option value="">Automatic ({status.textModel ?? "none installed"})</option>
          {chatModels.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} · {m.sizeGB} GB
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="vision-model" className="label">
          Model for meal photos
        </label>
        <select id="vision-model" className="field" value={settings.visionModel} onChange={(e) => void change({ visionModel: e.target.value })}>
          <option value="">Automatic ({status.visionModel ?? "none installed"})</option>
          {visionModels.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} · {m.sizeGB} GB
            </option>
          ))}
        </select>
        {visionModels.length === 0 && (
          <p className="mt-1 text-xs text-muted">
            No photo-capable model installed. Try <code>ollama pull qwen2.5vl:7b</code>.
          </p>
        )}
      </div>

      <p className="text-xs text-muted">
        Bigger models give better estimates but need more memory and time. Using one model for both jobs avoids swapping models in
        and out of memory. If things feel slow (for example while a game is using the graphics card), a small model like
        qwen3:4b-instruct is much quicker for typed meals.
      </p>
    </div>
  );
}

function DataSection() {
  const { importBackup, resetAll } = useStore();
  const [pending, setPending] = useState<{ data: unknown; entries: number } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function readFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { entries?: unknown[] };
      setPending({ data, entries: Array.isArray(data.entries) ? data.entries.length : 0 });
    } catch {
      toast("That file isn't valid JSON.", "error");
    }
  }

  return (
    <section aria-labelledby="data-title" className="card p-5 sm:p-6">
      <h2 id="data-title" className="mb-2 text-lg font-semibold">
        Your data
      </h2>
      <p className="text-sm text-ink-2">
        Everything is stored in the <code className="rounded bg-surface-2 px-1">data</code> folder inside the app. Nothing is sent to the
        internet.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/api/backup" download className="btn btn-secondary">
          Download backup
        </a>
        <label className="btn btn-secondary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-strong">
          Restore from backup
          <input type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
        </label>
      </div>

      {pending && (
        <div role="alert" className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
          <p>
            Replace all current data with this backup ({pending.entries} food entries)? Photos aren&apos;t part of backups.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await importBackup(pending.data);
                  toast("Backup restored");
                } catch (err) {
                  toast(errorText(err), "error");
                }
                setPending(null);
              }}
            >
              Replace my data
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-line pt-4">
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Delete every entry, weigh-in and photo? This can&apos;t be undone.</span>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void resetAll().catch((err) => toast(errorText(err), "error"))}
            >
              Delete everything
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost text-critical" onClick={() => setConfirmReset(true)}>
            Delete all data…
          </button>
        )}
      </div>
    </section>
  );
}
