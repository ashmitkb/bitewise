import { planTargets } from "./nutrition";
import type { Targets, UserData } from "./types";

export function targetsOnly(t: Targets): Targets {
  return { calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat };
}

export function upsertWeight(data: UserData, date: string, kg: number): void {
  const existing = data.weights.find((w) => w.date === date);
  if (existing) existing.kg = kg;
  else data.weights.push({ date, kg });
  data.weights.sort((a, b) => a.date.localeCompare(b.date));
}

/** The latest weigh-in drives the profile weight, and with it the auto-calculated targets. */
export function syncProfileWeight(data: UserData): void {
  const latest = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!data.profile || !latest) return;
  data.profile.weightKg = latest.kg;
  if (!data.profile.customTargets) data.profile.targets = targetsOnly(planTargets(data.profile));
}
