"use client";

import { useState } from "react";
import { errorText, toast } from "@/lib/client";
import { addDays, dayLabel, lastNDates, shortDate, todayISO } from "@/lib/dates";
import { ZERO, dayTotals, formatKcal, round1, sumNutrients } from "@/lib/nutrition";
import type { Nutrients } from "@/lib/types";
import { CaloriesChart, WeightChart, type DayTotals } from "../charts";
import { TrashIcon } from "../icons";
import { MacroMeters } from "../meters";
import { useAppState, useStore } from "../StoreProvider";

const RANGES = [7, 30, 90] as const;

export function ProgressView() {
  const state = useAppState();
  const profile = state.profile!;
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const today = todayISO();
  const dates = lastNDates(today, range);
  const days: DayTotals[] = dates.map((date) => ({ date, ...dayTotals(state.entries, date) }));
  const logged = days.filter((d) => d.calories > 0);
  const avg: Nutrients = logged.length
    ? (Object.fromEntries(Object.entries(sumNutrients(logged)).map(([k, v]) => [k, v / logged.length])) as unknown as Nutrients)
    : ZERO;

  const allWeights = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const weights = allWeights.filter((w) => w.date >= dates[0] && w.date <= today);
  const latest = allWeights.at(-1);
  const weightChange = weights.length >= 2 ? round1(weights[weights.length - 1].kg - weights[0].kg) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <fieldset className="w-full sm:w-80">
          <legend className="visually-hidden">Time range</legend>
          <div className="segmented">
            {RANGES.map((n) => (
              <label key={n}>
                <input type="radio" name="range" value={n} checked={range === n} onChange={() => setRange(n)} />
                <span>{n} days</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Average calories" value={logged.length ? formatKcal(avg.calories) : "–"} unit="kcal" note={`Target ${formatKcal(profile.targets.calories)}`} />
        <StatTile label="Days logged" value={String(logged.length)} unit={`of ${range}`} note={streakText(state.entries.map((e) => e.date), today)} />
        <StatTile label="Average protein" value={logged.length ? String(Math.round(avg.protein)) : "–"} unit="g" note={`Target ${profile.targets.protein} g`} />
        <StatTile
          label="Weight"
          value={latest ? String(latest.kg) : "–"}
          unit="kg"
          note={weightChange === null ? "Log more weigh-ins to see a trend" : `${weightChange > 0 ? "▲ +" : weightChange < 0 ? "▼ " : ""}${weightChange} kg in ${range} days`}
        />
      </div>

      <section aria-labelledby="cal-title" className="card p-5">
        <h2 id="cal-title" className="mb-1 font-semibold">
          Calories per day
        </h2>
        <p className="mb-3 text-sm text-ink-2">Dashed line: your daily target. Hover or use arrow keys to see each day.</p>
        <CaloriesChart days={days} target={profile.targets.calories} />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-2">Show as table</summary>
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="tabular w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="py-1.5 font-medium">Day</th>
                  <th className="py-1.5 text-right font-medium">kcal</th>
                  <th className="py-1.5 text-right font-medium">Protein</th>
                  <th className="py-1.5 text-right font-medium">Carbs</th>
                  <th className="py-1.5 text-right font-medium">Fat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...days].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="py-1.5">{dayLabel(d.date, today)}</td>
                    <td className="py-1.5 text-right">{d.calories ? formatKcal(d.calories) : "–"}</td>
                    <td className="py-1.5 text-right">{d.calories ? `${Math.round(d.protein)} g` : "–"}</td>
                    <td className="py-1.5 text-right">{d.calories ? `${Math.round(d.carbs)} g` : "–"}</td>
                    <td className="py-1.5 text-right">{d.calories ? `${Math.round(d.fat)} g` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section aria-labelledby="macro-title" className="card p-5">
          <h2 id="macro-title" className="mb-1 font-semibold">
            Average macros
          </h2>
          <p className="mb-4 text-sm text-ink-2">Per logged day, against your daily targets.</p>
          {logged.length ? (
            <MacroMeters eaten={avg} targets={profile.targets} note="none" />
          ) : (
            <p className="rounded-xl bg-surface-2 px-4 py-8 text-center text-sm text-ink-2">Nothing logged in this period yet.</p>
          )}
        </section>

        <section aria-labelledby="weight-title" className="card p-5">
          <h2 id="weight-title" className="mb-3 font-semibold">
            Weight
          </h2>
          <WeightForm lastKg={latest?.kg} />
          <div className="mt-4">
            <WeightChart points={weights} start={dates[0]} end={today} />
          </div>
          {weights.length > 0 && <WeighIns weights={weights} />}
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value, unit, note }: { label: string; value: string; unit: string; note: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1">
        <span className="text-2xl font-semibold tracking-tight">{value}</span> <span className="text-sm text-ink-2">{unit}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </div>
  );
}

function streakText(dates: string[], today: string): string {
  const days = new Set(dates);
  let streak = 0;
  // an empty today doesn't break the streak until the day is over
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak > 1 ? `${streak}-day streak` : streak === 1 ? "1-day streak" : "Log today to start a streak";
}

function WeightForm({ lastKg }: { lastKg?: number }) {
  const { setWeight } = useStore();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState(lastKg ? String(lastKg) : "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await setWeight(date, Number(kg.replace(",", ".")));
          toast("Weight saved. Your targets are updated.");
        } catch (err) {
          toast(errorText(err), "error");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="w-36">
        <label htmlFor="w-kg" className="label">
          Weight (kg)
        </label>
        <input id="w-kg" className="field tabular" type="number" inputMode="decimal" step="any" min={20} max={400} required value={kg} onChange={(e) => setKg(e.target.value)} />
      </div>
      <div className="w-44">
        <label htmlFor="w-date" className="label">
          Date
        </label>
        <input id="w-date" className="field" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Saving…" : "Save weigh-in"}
      </button>
    </form>
  );
}

function WeighIns({ weights }: { weights: { date: string; kg: number }[] }) {
  const { deleteWeight } = useStore();
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-ink-2">All weigh-ins in this period ({weights.length})</summary>
      <ul className="mt-2 max-h-60 divide-y divide-line overflow-auto">
        {[...weights].reverse().map((w) => (
          <li key={w.date} className="flex items-center justify-between py-1 text-sm">
            <span>{shortDate(w.date)}</span>
            <span className="flex items-center gap-2">
              <span className="tabular font-medium">{w.kg} kg</span>
              <button
                type="button"
                className="icon-btn size-9"
                aria-label={`Delete weigh-in from ${shortDate(w.date)}`}
                onClick={() => void deleteWeight(w.date).catch((err) => toast(errorText(err), "error"))}
              >
                <TrashIcon size={16} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
