"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorText, imageToJpeg, streamEvents, toast, uid } from "@/lib/client";
import { formatKcal, per100gFromTotals, roundNutrients, scaleNutrients, sumNutrients } from "@/lib/nutrition";
import type { AnalyzeEvent, FoodDraft, FoodEntry, MealType } from "@/lib/types";
import { MEALS } from "@/lib/types";
import { CameraIcon, CheckIcon, CloseIcon, ImageIcon, PencilIcon, PlusIcon, SparkIcon, TextIcon } from "../icons";
import { Sheet } from "../Sheet";
import { useStore } from "../StoreProvider";
import { MealPicker, PlateRow, itemTotals, type PlateItem } from "./food-items";

type Mode = "describe" | "photo" | "manual";

const MODES: { id: Mode; label: string; Icon: typeof TextIcon }[] = [
  { id: "describe", label: "Describe", Icon: TextIcon },
  { id: "photo", label: "Photo", Icon: CameraIcon },
  { id: "manual", label: "Manual", Icon: PencilIcon },
];

const EXAMPLES = ["2 idlis with sambar and chutney", "1 plate chicken biryani and raita", "Oats with milk, a banana and 5 almonds"];

export function AddFoodSheet({ open, date, meal, onClose }: { open: boolean; date: string; meal: MealType; onClose: () => void }) {
  const [dirty, setDirty] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={() => {
        setDirty(false);
        onClose();
      }}
      title="Log food"
      dismissible={!dirty}
    >
      <AddFoodFlow date={date} initialMeal={meal} onDone={onClose} onDirtyChange={setDirty} />
    </Sheet>
  );
}

function recentFoods(entries: FoodEntry[], limit: number): FoodEntry[] {
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  for (const e of [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = e.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length === limit) break;
  }
  return out;
}

function AddFoodFlow({
  date,
  initialMeal,
  onDone,
  onDirtyChange,
}: {
  date: string;
  initialMeal: MealType;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { state, addEntries } = useStore();
  const [meal, setMeal] = useState(initialMeal);
  const [mode, setMode] = useState<Mode>("describe");
  const [view, setView] = useState<"input" | "review">("input");
  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ full: string; thumb: string } | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [busy, setBusy] = useState<{ status: string; found: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // Start loading the model while you type or pick a photo.
  useEffect(() => {
    if (mode === "manual") return;
    void api("/api/ai/warmup", { method: "POST", body: { kind: mode === "photo" ? "vision" : "text" } }).catch(() => undefined);
  }, [mode]);

  // Closing the sheet cancels a running analysis.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Anything typed, photographed or on the plate would be lost by a stray tap outside the sheet.
  const dirty = text.trim() !== "" || photo !== null || plate.length > 0 || busy !== null;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const recent = useMemo(() => recentFoods(state?.entries ?? [], 8), [state?.entries]);
  const plateTotals = sumNutrients(plate.map(itemTotals));
  const mealLabel = MEALS.find((m) => m.id === meal)?.label.toLowerCase() ?? meal;

  function addToPlate(items: PlateItem[]) {
    setPlate((p) => [...p, ...items]);
  }

  async function analyze() {
    const usingPhoto = mode === "photo";
    if (usingPhoto ? !photo : !text.trim()) {
      setError(usingPhoto ? "Add a photo first." : "Describe what you ate first.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setBusy({ status: "Starting…", found: [] });
    const result: { items: FoodDraft[] | null } = { items: null };
    try {
      await streamEvents<AnalyzeEvent>(
        "/api/ai/analyze",
        usingPhoto ? { image: photo!.full, text: photoNote } : { text },
        (event) => {
          if (event.type === "status") setBusy((b) => b && { ...b, status: event.message });
          else if (event.type === "found") setBusy((b) => b && { ...b, found: event.names });
          else if (event.type === "result") result.items = event.items;
          else if (event.type === "error") throw new Error(event.message);
        },
        controller.signal,
      );
      if (!result.items) throw new Error("The analysis stopped before it finished. Please try again.");
      if (result.items.length === 0) {
        setError(usingPhoto ? "I couldn't spot any food in that photo." : "I couldn't find any food in that. Try naming the dishes.");
        return;
      }
      addToPlate(
        result.items.map((d) => ({
          key: d.key,
          name: d.name,
          portion: d.portion,
          grams: d.grams,
          per100g: d.per100g,
          totals: scaleNutrients(d.per100g, d.grams),
          source: usingPhoto ? "photo" : "text",
          fromPhoto: usingPhoto,
          confidence: d.confidence,
        })),
      );
      if (!usingPhoto) setText("");
      setView("review");
    } catch (err) {
      if (!controller.signal.aborted) setError(errorText(err));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(null);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const [full, thumb] = await Promise.all([imageToJpeg(file, 1024, 0.85), imageToJpeg(file, 320, 0.75)]);
      setPhoto({ full, thumb });
    } catch (err) {
      setError(errorText(err));
    }
  }

  function addRecent(e: FoodEntry) {
    addToPlate([
      {
        key: uid(),
        name: e.name,
        portion: e.portion,
        grams: e.grams,
        per100g: e.per100g,
        totals: { calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat },
        source: e.source,
        fromPhoto: false,
      },
    ]);
    setAdded((s) => new Set(s).add(e.id));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await addEntries({
        date,
        meal,
        photo: plate.some((i) => i.fromPhoto) ? (photo?.thumb ?? null) : null,
        items: plate.map((i) => ({
          name: i.name.trim() || "Food",
          portion: i.portion,
          grams: i.grams,
          per100g: i.per100g ? roundNutrients(i.per100g) : null,
          ...roundNutrients(itemTotals(i)),
          source: i.source,
          withPhoto: i.fromPhoto,
        })),
      });
      toast(`Added ${plate.length} ${plate.length === 1 ? "item" : "items"} to ${mealLabel}`);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  const errorBox = error && (
    <p role="alert" className="rounded-xl bg-critical/10 px-3 py-2 text-sm text-ink">
      {error}
    </p>
  );

  // ---------------------------------------------------------------- analyzing
  if (busy) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center py-6 text-center">
        {mode === "photo" && photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
          <img src={photo.thumb} alt="Your meal photo" className="mb-5 h-36 w-36 rounded-2xl object-cover" />
        )}
        <Spinner />
        <p className="mt-4 font-medium">{busy.status}</p>
        {busy.found.length > 0 && (
          <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Found so far">
            {busy.found.map((name, i) => (
              <li key={`${name}-${i}`} className="rounded-full bg-brand/12 px-3 py-1 text-sm font-medium">
                {name}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-ghost mt-6" onClick={() => abortRef.current?.abort()}>
          Cancel
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------- review
  if (view === "review") {
    return (
      <div className="space-y-4">
        <MealPicker value={meal} onChange={setMeal} />
        {plate.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-6 text-center text-sm text-ink-2">Your plate is empty.</p>
        ) : (
          <ul className="space-y-3">
            {plate.map((item) => (
              <li key={item.key}>
                <PlateRow
                  item={item}
                  onChange={(next) => setPlate((p) => p.map((x) => (x.key === item.key ? next : x)))}
                  onRemove={() => setPlate((p) => p.filter((x) => x.key !== item.key))}
                />
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-secondary w-full" onClick={() => setView("input")}>
          <PlusIcon size={18} /> Add more food
        </button>
        {plate.some((i) => i.source !== "manual") && (
          <p className="text-xs text-muted">
            These are AI estimates. If a weight looks off, fix it and the numbers update.
          </p>
        )}
        {errorBox}
        <div className="sticky bottom-0 -mx-5 -mb-4 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-ink-2">Total</span>
            <span className="tabular">
              <span className="text-base font-semibold">{formatKcal(plateTotals.calories)} kcal</span>
              <span className="text-ink-2">
                {" "}
                · P {Math.round(plateTotals.protein)} · C {Math.round(plateTotals.carbs)} · F {Math.round(plateTotals.fat)}
              </span>
            </span>
          </div>
          <button type="button" className="btn btn-primary w-full" disabled={saving || plate.length === 0} onClick={() => void save()}>
            {saving ? "Saving…" : `Save to ${mealLabel}`}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- input
  return (
    <div className="space-y-4">
      <MealPicker value={meal} onChange={setMeal} />

      <fieldset>
        <legend className="visually-hidden">How do you want to log it?</legend>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(({ id, label, Icon }) => (
            <label
              key={id}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border py-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-strong ${
                mode === id ? "border-brand-strong bg-brand/8 text-ink" : "border-line text-ink-2 hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="add-mode"
                value={id}
                checked={mode === id}
                onChange={() => {
                  setMode(id);
                  setError(null);
                }}
                className="visually-hidden"
              />
              <Icon size={20} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "describe" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void analyze();
          }}
        >
          <div>
            <label htmlFor="meal-text" className="label">
              What did you eat?
            </label>
            <textarea
              id="meal-text"
              className="field"
              rows={3}
              maxLength={1000}
              placeholder="e.g. 2 rotis, a bowl of dal and some curd"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void analyze();
                }
              }}
            />
          </div>
          {/* Always shown so the layout doesn't jump when you start typing */}
          <ul className="flex flex-wrap gap-2" aria-label="Examples">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button type="button" className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2" onClick={() => setText(ex)}>
                  {ex}
                </button>
              </li>
            ))}
          </ul>
          {errorBox}
          <button type="submit" className="btn btn-primary w-full">
            <SparkIcon size={18} /> Analyze with AI
          </button>
        </form>
      )}

      {mode === "photo" && (
        <div className="space-y-3">
          {!photo ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="btn btn-secondary h-24 flex-col rounded-2xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-strong">
                <CameraIcon size={22} />
                Take photo
                <input type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
              </label>
              <label className="btn btn-secondary h-24 flex-col rounded-2xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-strong">
                <ImageIcon size={22} />
                Choose photo
                <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
              </label>
            </div>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              <img src={photo.full} alt="Your meal photo" className="max-h-72 w-full rounded-2xl object-cover" />
              <button
                type="button"
                className="icon-btn absolute right-2 top-2 bg-surface/90 shadow"
                aria-label="Remove photo"
                onClick={() => setPhoto(null)}
              >
                <CloseIcon size={18} />
              </button>
            </div>
          )}
          <div>
            <label htmlFor="photo-note" className="label">
              Anything the photo doesn&apos;t show? <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="photo-note"
              className="field"
              maxLength={300}
              placeholder="e.g. cooked in ghee, I only ate half"
              value={photoNote}
              onChange={(e) => setPhotoNote(e.target.value)}
            />
          </div>
          {errorBox}
          <button type="button" className="btn btn-primary w-full" onClick={() => void analyze()}>
            <SparkIcon size={18} /> Analyze photo
          </button>
        </div>
      )}

      {mode === "manual" && (
        <ManualForm
          error={errorBox}
          onAdd={(item) => {
            addToPlate([item]);
            setView("review");
          }}
        />
      )}

      {mode !== "manual" && recent.length > 0 && (
        <section aria-labelledby="recent-title" className="pt-2">
          <h3 id="recent-title" className="mb-2 text-sm font-semibold text-ink-2">
            Recent foods
          </h3>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 pl-3 pr-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[e.portion, `${formatKcal(e.calories)} kcal`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  aria-label={added.has(e.id) ? `${e.name} added` : `Add ${e.name}`}
                  onClick={() => addRecent(e)}
                >
                  {added.has(e.id) ? <CheckIcon className="text-brand-strong" /> : <PlusIcon />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plate.length > 0 && (
        <div className="sticky bottom-0 -mx-5 -mb-4 flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span className="text-sm">
            <span className="font-semibold">
              {plate.length} {plate.length === 1 ? "item" : "items"}
            </span>{" "}
            <span className="text-ink-2">· {formatKcal(plateTotals.calories)} kcal</span>
          </span>
          <button type="button" className="btn btn-primary" onClick={() => setView("review")}>
            Review &amp; save
          </button>
        </div>
      )}
    </div>
  );
}

function ManualForm({ onAdd, error }: { onAdd: (item: PlateItem) => void; error: React.ReactNode }) {
  const [values, setValues] = useState({ name: "", portion: "", grams: "", calories: "", protein: "", carbs: "", fat: "" });
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const totals = { calories: n(values.calories), protein: n(values.protein), carbs: n(values.carbs), fat: n(values.fat) };
        const grams = values.grams.trim() ? Math.round(n(values.grams)) : null;
        onAdd({
          key: uid(),
          name: values.name.trim(),
          portion: values.portion.trim(),
          grams,
          per100g: grams ? per100gFromTotals(totals, grams) : null,
          totals,
          source: "manual",
          fromPhoto: false,
        });
      }}
    >
      <div>
        <label htmlFor="m-name" className="label">
          Food
        </label>
        <input id="m-name" className="field" required maxLength={80} placeholder="e.g. Protein bar" value={values.name} onChange={set("name")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="m-portion" className="label">
            Portion <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="m-portion" className="field" maxLength={80} placeholder="1 bar" value={values.portion} onChange={set("portion")} />
        </div>
        <div>
          <label htmlFor="m-grams" className="label">
            Weight g <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="m-grams" className="field tabular" type="number" inputMode="numeric" min={1} max={5000} value={values.grams} onChange={set("grams")} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ["calories", "kcal", true],
            ["protein", "Protein g", false],
            ["carbs", "Carbs g", false],
            ["fat", "Fat g", false],
          ] as const
        ).map(([key, label, required]) => (
          <div key={key}>
            <label htmlFor={`m-${key}`} className="label text-xs">
              {label}
            </label>
            <input
              id={`m-${key}`}
              className="field tabular px-2"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              max={key === "calories" ? 20000 : 2000}
              required={required}
              value={values[key]}
              onChange={set(key)}
            />
          </div>
        ))}
      </div>
      {error}
      <button type="submit" className="btn btn-primary w-full">
        Add to plate
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="size-10 animate-spin text-brand" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
      <path d="M36 20a16 16 0 0 0-16-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
