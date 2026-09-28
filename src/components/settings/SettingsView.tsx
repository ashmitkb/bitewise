"use client";

import { useState } from "react";
import { errorText, toast } from "@/lib/client";
import { todayISO } from "@/lib/dates";
import type { AiStatus, Settings } from "@/lib/types";
import { ProfileForm } from "../ProfileForm";
import { Avatar } from "../ProfilePicker";
import { useAppState, useStore } from "../StoreProvider";
import { useAiStatus } from "../useAiStatus";

export function SettingsView() {
  const state = useAppState();
  const { saveProfile } = useStore();
  const { status, refresh } = useAiStatus();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <AccountSection />

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
          Open one of these addresses in your phone&apos;s browser, then snap meal photos straight from the camera. This computer does the
          work, so it has to be on.
        </p>
        <h3 className="mt-4 text-sm font-semibold">At home, on the same Wi-Fi</h3>
        <UrlList urls={status?.lanUrls} empty="No Wi-Fi connection found." />
        <h3 className="mt-4 text-sm font-semibold">From anywhere, with Tailscale</h3>
        <UrlList
          urls={status?.tailscaleUrls}
          empty="Install Tailscale on this computer and your phone, sign in to both with the same account, and an address shows up here."
        />
        <p className="mt-3 text-xs text-muted">
          Addresses on the same Wi-Fi can change when your router restarts; this page always shows the current ones. See the README
          for setting up Tailscale and sharing with a friend.
        </p>
      </section>

      <DataSection />
    </div>
  );
}

function UrlList({ urls, empty }: { urls?: string[]; empty: string }) {
  if (!urls) return <p className="mt-2 text-sm text-muted">Checking…</p>;
  if (!urls.length) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-2 space-y-1">
      {urls.map((url) => (
        <li key={url}>
          <code className="rounded-lg bg-surface-2 px-2 py-1 text-sm">{url}</code>
        </li>
      ))}
    </ul>
  );
}

/** Who's signed in, switching profile, and the profile's PIN. */
function AccountSection() {
  const state = useAppState();
  const { signOut, setPin } = useStore();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { me, peopleCount } = state;

  async function save(pin: string | null) {
    if (pin !== null && pin !== confirm) return setError("The two PINs don't match.");
    setBusy(true);
    setError(null);
    try {
      await setPin(me.hasPin ? current : undefined, pin);
      toast(pin ? "PIN saved" : "PIN removed");
      setEditing(false);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="account-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={me.name} size={48} />
        <div className="min-w-0 flex-1">
          <h2 id="account-title" className="truncate text-lg font-semibold">
            {me.name}
          </h2>
          <p className="text-sm text-ink-2">
            {me.hasPin ? "Protected with a PIN" : "No PIN"}
            {peopleCount > 1 && ` · ${peopleCount} profiles on this computer`}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          Switch profile
        </button>
      </div>

      {!me.hasPin && peopleCount > 1 && (
        <p className="mt-4 rounded-xl bg-serious/10 px-3 py-2 text-sm">Anyone using this app can open your profile. Set a PIN to keep your log private.</p>
      )}

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(next);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {me.hasPin && (
              <div>
                <label htmlFor="pin-current" className="label">
                  Current PIN
                </label>
                <input id="pin-current" className="field tabular" type="password" inputMode="numeric" autoComplete="current-password" required maxLength={8} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))} />
              </div>
            )}
            <div>
              <label htmlFor="pin-new" className="label">
                New PIN
              </label>
              <input id="pin-new" className="field tabular" type="password" inputMode="numeric" autoComplete="new-password" required pattern="\d{4,8}" minLength={4} maxLength={8} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label htmlFor="pin-confirm" className="label">
                Repeat new PIN
              </label>
              <input id="pin-confirm" className="field tabular" type="password" inputMode="numeric" autoComplete="new-password" required maxLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-critical/10 px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Save PIN
            </button>
            {me.hasPin && peopleCount === 1 && (
              <button type="button" className="btn btn-ghost" disabled={busy || !current} onClick={() => void save(null)}>
                Remove PIN
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost mt-3 -ml-3" onClick={() => setEditing(true)}>
          {me.hasPin ? "Change PIN" : "Set a PIN"}
        </button>
      )}
    </section>
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
  const { importBackup, deleteMe } = useStore();
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
        Your log is stored on this computer in the <code className="rounded bg-surface-2 px-1">data</code> folder, separately from other
        profiles. Nothing is sent to the internet.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/api/backup" download className="btn btn-secondary">
          Download my backup
        </a>
        <label className="btn btn-secondary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-strong">
          Restore from backup
          <input type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
        </label>
      </div>

      {pending && (
        <div role="alert" className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
          <p>
            Replace the data in your profile with this backup ({pending.entries} food entries)? Photos aren&apos;t part of backups.
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
            <span>Delete your profile with every entry, weigh-in and photo? Other profiles stay. This can&apos;t be undone.</span>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void deleteMe().catch((err) => toast(errorText(err), "error"))}
            >
              Delete my profile
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost text-critical" onClick={() => setConfirmReset(true)}>
            Delete my profile…
          </button>
        )}
      </div>
    </section>
  );
}
