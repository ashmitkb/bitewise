import { planTargets } from "./nutrition";
import type { AppState, Targets } from "./types";

export function targetsOnly(t: Targets): Targets {
  return { calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat };
}

export function upsertWeight(state: AppState, date: string, kg: number): void {
  const existing = state.weights.find((w) => w.date === date);
  if (existing) existing.kg = kg;
  else state.weights.push({ date, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
}

/** The latest weigh-in drives the profile weight, and with it the auto-calculated targets. */
export function syncProfileWeight(state: AppState): void {
  const latest = [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!state.profile || !latest) return;
  state.profile.weightKg = latest.kg;
  if (!state.profile.customTargets) state.profile.targets = targetsOnly(planTargets(state.profile));
}
