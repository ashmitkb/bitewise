"use client";

import { useId, useState } from "react";
import { formatKcal, per100gFromTotals, round1, scaleNutrients } from "@/lib/nutrition";
import type { EntrySource, FoodDraft, MealType, Nutrients } from "@/lib/types";
import { MEALS } from "@/lib/types";
import { MinusIcon, PlusIcon, TrashIcon } from "../icons";

/** A food on the "plate": found by the AI, picked from recents or typed in, not saved yet. */
export interface PlateItem {
  key: string;
  name: string;
  portion: string;
  /** null for manual items logged without a weight */
  grams: number | null;
  /** when known, totals follow the grams */
  per100g: Nutrients | null;
  /** used when per100g is null */
  totals: Nutrients;
  source: EntrySource;
  fromPhoto: boolean;
  confidence?: FoodDraft["confidence"];
}

export function itemTotals(item: PlateItem): Nutrients {
  return item.per100g && item.grams !== null ? scaleNutrients(item.per100g, item.grams) : item.totals;
}

const parseNumber = (s: string) => Number(s.replace(",", "."));

/**
 * Text input for numbers that keeps what you type ("12.", "") instead of fighting you,
 * and reports a number whenever the text is a valid one.
 */
export function NumberField({
  value,
  onValue,
  decimals = 0,
  ...props
}: { value: number; onValue: (n: number) => void; decimals?: number } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  const format = (n: number) => String(decimals ? round1(n) : Math.round(n));
  const [text, setText] = useState(format(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    // value changed from outside (e.g. the +/- buttons): show it, unless it's what's already typed
    setPrev(value);
    if (parseNumber(text) !== value) setText(format(value));
  }
  return (
    <input
      {...props}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onValue(n);
      }}
    />
  );
}

export function MealPicker({ value, onChange }: { value: MealType; onChange: (meal: MealType) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="visually-hidden">Meal</legend>
      <div className="segmented">
        {MEALS.map((m) => (
          <label key={m.id}>
            <input type="radio" name={name} value={m.id} checked={value === m.id} onChange={() => onChange(m.id)} />
            <span className="px-1.5">{m.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function gramStep(g: number) {
  return g < 50 ? 5 : g < 250 ? 10 : 25;
}

const TOTAL_FIELDS = [
  ["calories", "kcal", 0],
  ["protein", "Protein g", 1],
  ["carbs", "Carbs g", 1],
  ["fat", "Fat g", 1],
] as const;

/** One editable food row: name, weight with +/- and live totals. */
export function PlateRow({ item, onChange, onRemove }: { item: PlateItem; onChange: (item: PlateItem) => void; onRemove?: () => void }) {
  const id = useId();
  const [adjusting, setAdjusting] = useState(false);
  const totals = itemTotals(item);
  const setGrams = (grams: number) => onChange({ ...item, grams: Math.max(1, Math.min(5000, Math.round(grams))) });
  const setTotals = (next: Nutrients) =>
    onChange({ ...item, totals: next, per100g: item.grams ? per100gFromTotals(next, item.grams) : null });

  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-1">
        <label htmlFor={`${id}-name`} className="visually-hidden">
          Food name
        </label>
        <input
          id={`${id}-name`}
          className="field min-h-10 flex-1 border-transparent bg-transparent px-1.5 font-semibold hover:border-line"
          value={item.name}
          maxLength={80}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
        />
        {onRemove && (
          <button type="button" className="icon-btn size-10 shrink-0" aria-label={`Remove ${item.name}`} onClick={onRemove}>
            <TrashIcon size={18} />
          </button>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 pl-1.5">
        {item.grams !== null ? (
          <div className="flex items-center gap-1">
            <button type="button" className="icon-btn size-9 bg-surface-2" aria-label="Less" onClick={() => setGrams((item.grams ?? 0) - gramStep(item.grams ?? 0))}>
              <MinusIcon size={16} />
            </button>
            <label htmlFor={`${id}-grams`} className="visually-hidden">
              Weight in grams
            </label>
            <NumberField id={`${id}-grams`} className="field tabular min-h-9 w-20 px-2 text-center" value={item.grams} onValue={setGrams} />
            <button type="button" className="icon-btn size-9 bg-surface-2" aria-label="More" onClick={() => setGrams((item.grams ?? 0) + gramStep(item.grams ?? 0))}>
              <PlusIcon size={16} />
            </button>
            <span className="ml-1 text-sm text-ink-2">g</span>
          </div>
        ) : (
          <span className="text-sm text-ink-2">{item.portion || "1 serving"}</span>
        )}
        <div className="text-right">
          <div className="tabular font-semibold">{formatKcal(totals.calories)} kcal</div>
          <div className="tabular text-xs text-ink-2">
            P {round1(totals.protein)} · C {round1(totals.carbs)} · F {round1(totals.fat)}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 pl-1.5 text-xs">
        <span className="text-muted">
          {item.grams !== null && item.portion}
          {item.confidence === "low" && <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink-2">rough guess</span>}
        </span>
        <button type="button" className="font-medium text-ink-2 underline underline-offset-2" aria-expanded={adjusting} onClick={() => setAdjusting((a) => !a)}>
          {adjusting ? "Done" : "Adjust nutrition"}
        </button>
      </div>

      {adjusting && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {TOTAL_FIELDS.map(([key, label, decimals]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="mb-1 block text-xs text-ink-2">
                {label}
              </label>
              <NumberField
                id={`${id}-${key}`}
                className="field tabular min-h-10 px-2"
                decimals={decimals}
                value={decimals ? round1(totals[key]) : Math.round(totals[key])}
                onValue={(n) => setTotals({ ...totals, [key]: n })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
