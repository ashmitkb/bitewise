import type { Activity, FoodEntry, Goal, Nutrients, Profile, Targets } from "./types";

export const ACTIVITY_LEVELS: { id: Activity; label: string; hint: string; factor: number }[] = [
  { id: "sedentary", label: "Sedentary", hint: "Desk job, little exercise", factor: 1.2 },
  { id: "light", label: "Lightly active", hint: "Exercise 1–3 days a week", factor: 1.375 },
  { id: "moderate", label: "Moderately active", hint: "Exercise 3–5 days a week", factor: 1.55 },
  { id: "active", label: "Very active", hint: "Hard exercise 6–7 days a week", factor: 1.725 },
  { id: "very_active", label: "Athlete", hint: "Physical job or training twice a day", factor: 1.9 },
];

export const GOALS: { id: Goal; label: string }[] = [
  { id: "lose", label: "Lose" },
  { id: "maintain", label: "Maintain" },
  { id: "gain", label: "Gain" },
];

export const PACES: Record<"lose" | "gain", number[]> = {
  lose: [0.25, 0.5, 0.75],
  gain: [0.25, 0.5],
};

/** ~7,700 kcal of energy per kg of body weight change */
const KCAL_PER_KG = 7700;

export const ZERO: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export const round1 = (x: number) => Math.round(x * 10) / 10;

type BodyStats = Pick<Profile, "sex" | "age" | "heightCm" | "weightKg" | "activity" | "goal" | "pace">;

/** Mifflin–St Jeor resting energy expenditure */
export function bmr(p: BodyStats): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
}

export function maintenanceCalories(p: BodyStats): number {
  const factor = ACTIVITY_LEVELS.find((a) => a.id === p.activity)?.factor ?? 1.2;
  return bmr(p) * factor;
}

export interface TargetPlan extends Targets {
  bmr: number;
  maintenance: number;
  /** set when the goal would push calories below a safe minimum */
  flooredAt: number | null;
}

export function planTargets(p: BodyStats): TargetPlan {
  const maintenance = maintenanceCalories(p);
  const dailyShift = p.goal === "maintain" ? 0 : (p.pace * KCAL_PER_KG) / 7;
  let calories = p.goal === "lose" ? maintenance - dailyShift : maintenance + dailyShift;

  const floor = p.sex === "male" ? 1500 : 1200;
  let flooredAt: number | null = null;
  if (calories < floor) {
    calories = floor;
    flooredAt = floor;
  }
  calories = Math.round(calories / 10) * 10;

  // Higher protein while cutting or bulking helps keep/build muscle; capped at 35% of calories.
  const proteinPerKg = p.goal === "maintain" ? 1.2 : 1.6;
  const protein = Math.min(Math.round(p.weightKg * proteinPerKg), Math.round((calories * 0.35) / 4));
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { calories, protein, carbs, fat, bmr: Math.round(bmr(p)), maintenance: Math.round(maintenance), flooredAt };
}

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return {
    calories: per100g.calories * f,
    protein: per100g.protein * f,
    carbs: per100g.carbs * f,
    fat: per100g.fat * f,
  };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(
    (acc, n) => ({
      calories: acc.calories + n.calories,
      protein: acc.protein + n.protein,
      carbs: acc.carbs + n.carbs,
      fat: acc.fat + n.fat,
    }),
    { ...ZERO },
  );
}

export function roundNutrients(n: Nutrients): Nutrients {
  return { calories: Math.round(n.calories), protein: round1(n.protein), carbs: round1(n.carbs), fat: round1(n.fat) };
}

/**
 * Keep per-100 g values the model returns physically possible:
 * macros can't weigh more than 100 g, nothing beats pure fat (900 kcal),
 * and calories far below what the macros imply are replaced by the macro-based value.
 */
export function sanitizePer100g(n: Nutrients): Nutrients {
  const clean = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  let protein = clean(n.protein);
  let carbs = clean(n.carbs);
  let fat = clean(n.fat);
  const mass = protein + carbs + fat;
  if (mass > 100) {
    const k = 100 / mass;
    protein *= k;
    carbs *= k;
    fat *= k;
  }
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  let calories = Math.min(clean(n.calories), 900);
  if (fromMacros > 0 && calories < fromMacros * 0.6) calories = fromMacros;
  return { calories: round1(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) };
}

/** Per-100 g values implied by a portion's totals (used when someone edits the totals by hand). */
export function per100gFromTotals(totals: Nutrients, grams: number): Nutrients {
  if (grams <= 0) return { ...ZERO };
  return scaleNutrients(totals, 10000 / grams);
}

export function dayTotals(entries: FoodEntry[], date: string): Nutrients {
  return sumNutrients(entries.filter((e) => e.date === date));
}

export function formatKcal(n: number): string {
  return Math.round(n).toLocaleString();
}

export function formatGrams(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(round1(n));
}
