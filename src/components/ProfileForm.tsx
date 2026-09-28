"use client";

import { useState } from "react";
import { errorText } from "@/lib/client";
import { ACTIVITY_LEVELS, GOALS, PACES, formatKcal, planTargets } from "@/lib/nutrition";
import type { Activity, Goal, Profile, ProfileInput, Sex, Targets } from "@/lib/types";

interface Props {
  initial?: Profile | null;
  submitLabel: string;
  onSubmit: (profile: ProfileInput) => Promise<void>;
}

const toNum = (s: string) => (s.trim() === "" ? NaN : Number(s));
const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

export function ProfileForm({ initial, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sex, setSex] = useState<Sex | "">(initial?.sex ?? "");
  const [age, setAge] = useState(initial ? String(initial.age) : "");
  const [height, setHeight] = useState(initial ? String(initial.heightCm) : "");
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : "");
  const [activity, setActivity] = useState<Activity>(initial?.activity ?? "light");
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "lose");
  const [pace, setPace] = useState(initial && initial.pace > 0 ? initial.pace : 0.5);
  const [waterGoal, setWaterGoal] = useState(String(initial?.waterGoal ?? 8));
  const [dietNotes, setDietNotes] = useState(initial?.dietNotes ?? "");
  const [custom, setCustom] = useState(initial?.customTargets ?? false);
  const [customTargets, setCustomTargets] = useState<Record<keyof Targets, string>>({
    calories: String(initial?.targets.calories ?? ""),
    protein: String(initial?.targets.protein ?? ""),
    carbs: String(initial?.targets.carbs ?? ""),
    fat: String(initial?.targets.fat ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = { age: toNum(age), heightCm: toNum(height), weightKg: toNum(weight) };
  const paces = goal === "maintain" ? [] : PACES[goal];
  const effectivePace = goal === "maintain" ? 0 : paces.includes(pace) ? pace : paces[paces.length - 1];
  const statsValid =
    sex !== "" && inRange(stats.age, 13, 100) && inRange(stats.heightCm, 120, 230) && inRange(stats.weightKg, 30, 300);
  const plan = statsValid ? planTargets({ sex, ...stats, activity, goal, pace: effectivePace }) : null;

  function toggleCustom(on: boolean) {
    setCustom(on);
    // Start from the calculated numbers the first time
    if (on && plan && !customTargets.calories) {
      setCustomTargets({
        calories: String(plan.calories),
        protein: String(plan.protein),
        carbs: String(plan.carbs),
        fat: String(plan.fat),
      });
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sex === "") return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        sex,
        ...stats,
        activity,
        goal,
        pace: effectivePace,
        dietNotes: dietNotes.trim(),
        waterGoal: toNum(waterGoal),
        customTargets: custom,
        targets: custom
          ? {
              calories: toNum(customTargets.calories),
              protein: toNum(customTargets.protein),
              carbs: toNum(customTargets.carbs),
              fat: toNum(customTargets.fat),
            }
          : undefined,
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label htmlFor="pf-name" className="label">
          Name <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="pf-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
      </div>

      <fieldset>
        <legend className="label">Sex (for the calorie formula)</legend>
        <div className="segmented">
          {(["female", "male"] as const).map((s) => (
            <label key={s}>
              <input type="radio" name="sex" value={s} checked={sex === s} onChange={() => setSex(s)} required />
              <span className="capitalize">{s}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="pf-age" className="label">
            Age
          </label>
          <input id="pf-age" className="field tabular" type="number" inputMode="numeric" min={13} max={100} step={1} required value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pf-height" className="label">
            Height (cm)
          </label>
          <input id="pf-height" className="field tabular" type="number" inputMode="decimal" min={120} max={230} step="any" required value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pf-weight" className="label">
            Weight (kg)
          </label>
          <input id="pf-weight" className="field tabular" type="number" inputMode="decimal" min={30} max={300} step="any" required value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className="label">How active are you?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACTIVITY_LEVELS.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                activity === a.id ? "border-brand-strong bg-brand/8" : "border-line hover:bg-surface-2"
              }`}
            >
              <input type="radio" name="activity" value={a.id} checked={activity === a.id} onChange={() => setActivity(a.id)} className="mt-1 size-4" />
              <span>
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="block text-xs text-ink-2">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Weight goal</legend>
        <div className="segmented">
          {GOALS.map((g) => (
            <label key={g.id}>
              <input type="radio" name="goal" value={g.id} checked={goal === g.id} onChange={() => setGoal(g.id)} />
              <span>{g.label}</span>
            </label>
          ))}
        </div>
        {goal !== "maintain" && (
          <fieldset className="mt-3">
            <legend className="label">Pace (per week)</legend>
            <div className="segmented">
              {paces.map((p) => (
                <label key={p}>
                  <input type="radio" name="pace" value={p} checked={effectivePace === p} onChange={() => setPace(p)} />
                  <span>{p} kg</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </fieldset>

      <div>
        <label htmlFor="pf-notes" className="label">
          Food preferences <span className="font-normal text-muted">(optional, the coach uses these)</span>
        </label>
        <textarea
          id="pf-notes"
          className="field"
          rows={2}
          maxLength={300}
          placeholder="e.g. vegetarian, no eggs, lactose intolerant, mostly South Indian food"
          value={dietNotes}
          onChange={(e) => setDietNotes(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="pf-water" className="label">
          Water goal (250 ml glasses per day)
        </label>
        <input id="pf-water" className="field tabular max-w-32" type="number" inputMode="numeric" min={1} max={20} required value={waterGoal} onChange={(e) => setWaterGoal(e.target.value)} />
      </div>

      <section aria-live="polite" className="rounded-2xl bg-surface-2 p-4">
        {plan ? (
          <>
            <p className="text-sm text-ink-2">{custom ? "Suggested daily target" : "Your daily target"}</p>
            <p className="mt-0.5 text-3xl font-bold tracking-tight">{formatKcal(plan.calories)} kcal</p>
            <p className="mt-1 text-sm text-ink-2">
              Protein {plan.protein} g · Carbs {plan.carbs} g · Fat {plan.fat} g
            </p>
            <p className="mt-2 text-xs text-muted">
              Maintenance is about {formatKcal(plan.maintenance)} kcal a day (resting {formatKcal(plan.bmr)} kcal × activity).
              {goal !== "maintain" && ` ${goal === "lose" ? "Losing" : "Gaining"} ${effectivePace} kg a week means about ${formatKcal((effectivePace * 7700) / 7)} kcal ${goal === "lose" ? "less" : "more"} per day.`}
            </p>
            {plan.flooredAt && (
              <p className="mt-2 text-xs font-medium text-ink">
                Your target was raised to {formatKcal(plan.flooredAt)} kcal, the usual safe minimum. A slower pace gets you there more comfortably.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-2">Fill in your details to see your daily calorie and macro targets.</p>
        )}
      </section>

      <details open={initial?.customTargets || undefined}>
        <summary className="cursor-pointer text-sm font-medium text-ink-2">Set my own targets</summary>
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={custom} onChange={(e) => toggleCustom(e.target.checked)} className="size-4" />
            Use custom targets instead of the calculated ones
          </label>
          {custom && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["calories", "Calories (kcal)", 800, 6000],
                  ["protein", "Protein (g)", 0, 500],
                  ["carbs", "Carbs (g)", 0, 1000],
                  ["fat", "Fat (g)", 0, 400],
                ] as const
              ).map(([key, label, min, max]) => (
                <div key={key}>
                  <label htmlFor={`pf-t-${key}`} className="label">
                    {label}
                  </label>
                  <input
                    id={`pf-t-${key}`}
                    className="field tabular"
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    required
                    value={customTargets[key]}
                    onChange={(e) => setCustomTargets((t) => ({ ...t, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {error && (
        <p role="alert" className="rounded-xl bg-critical/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
