"use client";

import { useEffect, useState } from "react";
import { errorText, toast } from "@/lib/client";
import { roundNutrients } from "@/lib/nutrition";
import type { FoodEntry } from "@/lib/types";
import { TrashIcon } from "../icons";
import { Sheet } from "../Sheet";
import { useStore } from "../StoreProvider";
import { MealPicker, PlateRow, itemTotals, type PlateItem } from "./food-items";

export function EditEntrySheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const [dirty, setDirty] = useState(false);
  return (
    <Sheet
      open={entry !== null}
      onClose={() => {
        setDirty(false);
        onClose();
      }}
      title="Edit food"
      dismissible={!dirty}
    >
      {entry && <EditEntryForm entry={entry} onDone={onClose} onDirtyChange={setDirty} />}
    </Sheet>
  );
}

function EditEntryForm({ entry, onDone, onDirtyChange }: { entry: FoodEntry; onDone: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const { updateEntry, deleteEntry } = useStore();
  const [meal, setMeal] = useState(entry.meal);
  const [item, setItem] = useState<PlateItem>({
    key: entry.id,
    name: entry.name,
    portion: entry.portion,
    grams: entry.grams,
    per100g: entry.per100g,
    totals: { calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat },
    source: entry.source,
    fromPhoto: false,
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Totals recomputed from per-100 g values can differ from the saved ones by rounding, hence the tolerance.
  const totals = itemTotals(item);
  const dirty =
    meal !== entry.meal ||
    item.name !== entry.name ||
    item.grams !== entry.grams ||
    Math.abs(totals.calories - entry.calories) > 1 ||
    (["protein", "carbs", "fat"] as const).some((k) => Math.abs(totals[k] - entry[k]) > 0.2);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast(message);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const save = () =>
    run(
      () =>
        updateEntry(entry.id, {
          name: item.name.trim() || entry.name,
          meal,
          grams: item.grams,
          per100g: item.per100g ? roundNutrients(item.per100g) : null,
          ...roundNutrients(itemTotals(item)),
        }),
      "Saved",
    );

  return (
    <div className="space-y-4">
      {entry.photoId && (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own API route
        <img src={`/api/photos/${entry.photoId}`} alt={`Photo of ${entry.name}`} className="h-40 w-full rounded-2xl object-cover" />
      )}
      <MealPicker value={meal} onChange={setMeal} />
      <PlateRow item={item} onChange={setItem} />
      {error && (
        <p role="alert" className="rounded-xl bg-critical/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {confirming ? (
          <>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run(() => deleteEntry(entry.id), "Deleted")}>
              Yes, delete
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
            <TrashIcon size={18} /> Delete
          </button>
        )}
        <button type="button" className="btn btn-primary ml-auto" disabled={busy} onClick={() => void save()}>
          Save changes
        </button>
      </div>
    </div>
  );
}
