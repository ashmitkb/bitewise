"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { errorText, toast } from "@/lib/client";
import { addDays, dayLabel, longDate, mealForNow, todayISO } from "@/lib/dates";
import { formatKcal, sumNutrients } from "@/lib/nutrition";
import type { FoodEntry, MealType } from "@/lib/types";
import { MEALS } from "@/lib/types";
import { AddFoodSheet } from "../food/AddFoodSheet";
import { EditEntrySheet } from "../food/EditEntrySheet";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, DropIcon, MinusIcon, PlusIcon } from "../icons";
import { CalorieRing, MacroMeters } from "../meters";
import { useAppState, useStore } from "../StoreProvider";
import { useAiStatus } from "../useAiStatus";

export function TodayView() {
  const state = useAppState();
  const profile = state.profile!;
  const [date, setDate] = useState(todayISO);
  const [adding, setAdding] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const entries = state.entries.filter((e) => e.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const totals = sumNutrients(entries);
  const t = profile.targets;
  const over = totals.calories > t.calories;

  return (
    <>
      {/* extra bottom room on phones so the last meal can scroll clear of the floating button */}
      <div className="space-y-4 pb-20 sm:pb-0">
        <div className="flex items-center justify-between gap-3">
          <DateNav date={date} onChange={setDate} />
          <button type="button" className="btn btn-primary hidden sm:inline-flex" onClick={() => setAdding(mealForNow())}>
            <PlusIcon size={18} /> Log food
          </button>
        </div>

        <AiOfflineBanner />

        {state.peopleCount > 1 && !state.me.hasPin && (
          <Link href="/settings" className="flex items-center gap-3 rounded-2xl border border-serious/50 bg-serious/10 p-4 text-sm hover:bg-serious/15">
            <AlertIcon className="shrink-0 text-serious" />
            <span className="flex-1">
              <span className="font-semibold">Set a PIN.</span> Other people using this app can open your profile until you do.
            </span>
            <ChevronRightIcon size={18} />
          </Link>
        )}

        <section aria-label="Daily summary" className="card grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10 sm:p-6">
          <div className="flex flex-col items-center gap-3">
            <CalorieRing eaten={totals.calories} target={t.calories} />
            <dl className="flex gap-8 text-center text-sm">
              <div>
                <dt className="text-muted">Eaten</dt>
                <dd className="font-semibold">{formatKcal(totals.calories)}</dd>
              </div>
              <div>
                <dt className="text-muted">Target</dt>
                <dd className="font-semibold">{formatKcal(t.calories)}</dd>
              </div>
            </dl>
            {over && (
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <AlertIcon size={16} className="text-serious" />
                Over target by {formatKcal(totals.calories - t.calories)} kcal
              </p>
            )}
          </div>
          <MacroMeters eaten={totals} targets={t} />
        </section>

        <WaterCard date={date} goal={profile.waterGoal} />

        {MEALS.map((meal) => (
          <MealSection
            key={meal.id}
            meal={meal}
            entries={entries.filter((e) => e.meal === meal.id)}
            onAdd={() => setAdding(meal.id)}
            onEdit={setEditing}
          />
        ))}
      </div>

      {/* Kept outside the space-y container: its sibling margins would override the sheet's position. */}
      <button
        type="button"
        className="btn btn-primary fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-20 h-14 px-6 text-base shadow-lg sm:hidden"
        onClick={() => setAdding(mealForNow())}
      >
        <PlusIcon /> Log food
      </button>

      <AddFoodSheet open={adding !== null} date={date} meal={adding ?? "snack"} onClose={() => setAdding(null)} />
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function DateNav({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = todayISO();
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeftIcon />
      </button>
      <div className="relative">
        <button
          type="button"
          className="rounded-full px-3 py-1.5 text-left hover:bg-surface-2"
          onClick={() => {
            try {
              picker.current?.showPicker();
            } catch {
              picker.current?.focus();
            }
          }}
        >
          <span className="block text-xl font-bold leading-tight tracking-tight">{dayLabel(date, today)}</span>
          <span className="block text-xs text-muted">{longDate(date)}</span>
        </button>
        <input
          ref={picker}
          type="date"
          aria-label="Pick a date"
          className="visually-hidden"
          tabIndex={-1}
          value={date}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </div>
      <button type="button" className="icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => onChange(addDays(date, 1))}>
        <ChevronRightIcon />
      </button>
      {date !== today && (
        <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" onClick={() => onChange(today)}>
          Today
        </button>
      )}
    </div>
  );
}

function AiOfflineBanner() {
  const { status, refresh } = useAiStatus();
  if (!status || (status.online && status.textModel)) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-serious/50 bg-serious/10 p-4 text-sm">
      <AlertIcon className="mt-0.5 shrink-0 text-serious" />
      <div className="flex-1">
        <p className="font-semibold">{status.online ? "No AI model installed" : "The AI is offline"}</p>
        <p className="mt-0.5 text-ink-2">
          {status.online
            ? "Install one with: ollama pull qwen3.5:9b, then press Retry."
            : "Open the Ollama app (or run: ollama serve) to log meals by text or photo. Manual entry still works."}
        </p>
      </div>
      <button type="button" className="btn btn-secondary min-h-9 px-3 text-sm" onClick={() => void refresh()}>
        Retry
      </button>
    </div>
  );
}

function WaterCard({ date, goal }: { date: string; goal: number }) {
  const { state, setWater } = useStore();
  const glasses = state?.water[date] ?? 0;
  const change = (n: number) => setWater(date, Math.max(0, Math.min(40, n))).catch((err) => toast(errorText(err), "error"));

  return (
    <section aria-labelledby="water-title" className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <h2 id="water-title" className="font-semibold">
          Water
        </h2>
        <p className="text-sm text-ink-2">
          {glasses} of {goal} glasses · {(glasses * 0.25).toLocaleString()} L
        </p>
        <div className="mt-2 flex flex-wrap gap-1 text-ink-2" aria-hidden="true">
          {Array.from({ length: Math.max(goal, glasses) }, (_, i) => (
            <DropIcon key={i} size={18} filled={i < glasses} className={i < glasses ? "text-ink-2" : "text-line-strong"} />
          ))}
        </div>
      </div>
      {/* On phones these sit on the left, clear of the floating "Log food" button */}
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-secondary min-h-10 px-3" aria-label="Remove a glass of water" disabled={glasses === 0} onClick={() => void change(glasses - 1)}>
          <MinusIcon size={18} />
        </button>
        <button type="button" className="btn btn-secondary min-h-10 px-4" aria-label="Add a glass of water" onClick={() => void change(glasses + 1)}>
          <PlusIcon size={18} /> Glass
        </button>
      </div>
    </section>
  );
}

function MealSection({
  meal,
  entries,
  onAdd,
  onEdit,
}: {
  meal: { id: MealType; label: string };
  entries: FoodEntry[];
  onAdd: () => void;
  onEdit: (entry: FoodEntry) => void;
}) {
  const total = sumNutrients(entries);
  const titleId = `meal-${meal.id}`;
  return (
    <section aria-labelledby={titleId} className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 py-2 pl-4 pr-2">
        <h2 id={titleId} className="font-semibold">
          {meal.label}
        </h2>
        <div className="flex items-center gap-1">
          {entries.length > 0 && <span className="tabular text-sm text-ink-2">{formatKcal(total.calories)} kcal</span>}
          <button type="button" className="icon-btn" aria-label={`Add food to ${meal.label.toLowerCase()}`} onClick={onAdd}>
            <PlusIcon />
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">Nothing logged yet</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {entries.map((e) => (
            <li key={e.id}>
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => onEdit(e)}>
                {e.photoId && (
                  // eslint-disable-next-line @next/next/no-img-element -- served by our own API route
                  <img src={`/api/photos/${e.photoId}`} alt="" loading="lazy" className="size-11 shrink-0 rounded-xl object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {[e.portion, e.grams ? `${e.grams} g` : ""].filter(Boolean).join(" · ") || "1 serving"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-sm font-semibold">{formatKcal(e.calories)} kcal</span>
                  <span className="tabular block text-xs text-muted">
                    P {Math.round(e.protein)} · C {Math.round(e.carbs)} · F {Math.round(e.fat)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
