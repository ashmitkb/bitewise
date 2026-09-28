"use client";

import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/client";
import type { PersonSummary } from "@/lib/types";
import { ChevronLeftIcon, PlusIcon } from "./icons";
import { useStore } from "./StoreProvider";

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-brand/15 font-semibold text-brand-strong"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** "Who's using Bitewise?": pick your profile (and enter its PIN) or add a new one. */
export function ProfilePicker() {
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PersonSummary | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    api<PersonSummary[]>("/api/people").then(
      (list) => {
        if (!active) return;
        setPeople(list);
        if (list.length === 0) setAdding(true);
      },
      (err) => active && setLoadError(errorText(err)),
    );
    return () => {
      active = false;
    };
  }, []);

  if (loadError) return <p className="py-16 text-center text-ink-2">{loadError}</p>;
  if (!people) return <p className="py-16 text-center text-ink-2">Loading…</p>;

  return (
    <div className="mx-auto max-w-sm py-6">
      {chosen ? (
        <PinForm person={chosen} onBack={() => setChosen(null)} />
      ) : adding ? (
        <NewProfileForm first={people.length === 0} onBack={people.length ? () => setAdding(false) : undefined} />
      ) : (
        <>
          <h1 className="mb-6 text-center text-2xl font-bold tracking-tight">Who&apos;s using Bitewise?</h1>
          <ul className="space-y-2">
            {people.map((p) => (
              <li key={p.id}>
                <PersonButton person={p} onPick={() => setChosen(p)} />
              </li>
            ))}
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-strong p-3 text-left font-medium text-ink-2 hover:bg-surface-2"
                onClick={() => setAdding(true)}
              >
                <span className="grid size-11 place-items-center rounded-full bg-surface-2">
                  <PlusIcon />
                </span>
                Add a profile
              </button>
            </li>
          </ul>
          <p className="mt-6 text-center text-sm text-muted">Everyone gets their own food log, targets and coach.</p>
        </>
      )}
    </div>
  );
}

function PersonButton({ person, onPick }: { person: PersonSummary; onPick: () => void }) {
  const { signIn } = useStore();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="card flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2"
        // no PIN: straight in
        onClick={() => (person.hasPin ? onPick() : void signIn(person.id).catch((err) => setError(errorText(err))))}
      >
        <Avatar name={person.name} />
        <span className="flex-1 font-semibold">{person.name}</span>
        {person.hasPin && <span className="text-xs text-muted">PIN</span>}
      </button>
      {error && <p className="mt-1 text-sm text-critical">{error}</p>}
    </>
  );
}

function PinForm({ person, onBack }: { person: PersonSummary; onBack: () => void }) {
  const { signIn } = useStore();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="text-center"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await signIn(person.id, pin);
        } catch (err) {
          setError(errorText(err));
          setPin("");
          setBusy(false);
        }
      }}
    >
      <div className="mb-4 flex justify-center">
        <Avatar name={person.name} size={64} />
      </div>
      <h1 className="text-xl font-bold">Hi {person.name}</h1>
      <label htmlFor="pin" className="mt-4 block text-sm text-ink-2">
        Enter your PIN
      </label>
      <input
        id="pin"
        className="field tabular mx-auto mt-2 max-w-40 text-center text-2xl tracking-[0.4em]"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="\d{4,8}"
        minLength={4}
        maxLength={8}
        required
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Opening…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

function NewProfileForm({ first, onBack }: { first: boolean; onBack?: () => void }) {
  const { createPerson } = useStore();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pin !== confirm) return setError("The two PINs don't match.");
        setBusy(true);
        setError(null);
        try {
          await createPerson(name.trim(), pin || undefined);
        } catch (err) {
          setError(errorText(err));
          setBusy(false);
        }
      }}
    >
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">{first ? "Welcome to Bitewise" : "Add a profile"}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {first ? "Create your profile to get started." : "Your food log stays private to your profile."}
        </p>
      </div>
      <div>
        <label htmlFor="np-name" className="label">
          Name
        </label>
        <input id="np-name" className="field" required maxLength={30} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="np-pin" className="label">
            PIN {first && <span className="font-normal text-muted">(optional)</span>}
          </label>
          <input
            id="np-pin"
            className="field tabular"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4,8}"
            minLength={4}
            maxLength={8}
            required={!first}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            aria-describedby="np-pin-help"
          />
        </div>
        <div>
          <label htmlFor="np-confirm" className="label">
            Repeat PIN
          </label>
          <input
            id="np-confirm"
            className="field tabular"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            required={!first || pin !== ""}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>
      <p id="np-pin-help" className="text-xs text-muted">
        4 to 8 digits. It keeps other people using this app out of your profile.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-critical/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {onBack && (
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            <ChevronLeftIcon size={18} /> Back
          </button>
        )}
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          {busy ? "Creating…" : "Create profile"}
        </button>
      </div>
    </form>
  );
}
