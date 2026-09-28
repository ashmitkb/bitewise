import { addDays, longDate, toISODate } from "./dates";
import { ACTIVITY_LEVELS, dayTotals, formatKcal, round1 } from "./nutrition";
import type { AppState, FoodEntry } from "./types";
import { MEALS } from "./types";

// ---------------------------------------------------------------- food recognition

const per100g = {
  type: "object",
  properties: {
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
  },
  required: ["calories", "protein", "carbs", "fat"],
};

/**
 * The model returns grams + per-100 g values and the app does the multiplication.
 * Small local models recall food-table values well but get portion arithmetic wrong
 * (e.g. "200 g chicken = 165 kcal"); splitting the job fixes most of that.
 */
export const FOOD_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          portion: { type: "string" },
          grams: { type: "number" },
          per100g,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["name", "portion", "grams", "per100g", "confidence"],
      },
    },
  },
  required: ["items"],
};

const FOOD_RULES = `You are the nutrition engine of a diet tracking app. Identify every separate food or drink the person ate and estimate it.

For each item return:
- name: short, specific food name (e.g. "Dal tadka", "Grilled chicken breast")
- portion: the amount eaten in plain words (e.g. "2 medium rotis", "1 bowl")
- grams: total weight of that portion in grams (use ml for drinks)
- per100g: calories (kcal), protein, carbs and fat in grams per 100 g of the food as prepared, like a food composition table
- confidence: high, medium or low

Rules:
- Do not multiply or add anything up; the app calculates totals from grams and per100g.
- If the amount is vague, assume one typical serving. Typical weights: 1 roti or chapati 40 g, 1 paratha 80 g, 1 cup cooked rice 160 g, 1 bowl dal, sambar or curry 200 g, 1 bowl curd 150 g, 1 idli 50 g, 1 plain dosa 100 g, 1 masala dosa 180 g, 1 slice bread 30 g, 1 slice of a large pizza 110 g, 1 large egg 50 g, 1 medium banana 120 g, 1 medium apple 180 g, 1 cup tea or coffee 150 ml, 1 glass milk or juice 250 ml, 1 can soft drink 330 ml, 1 tbsp oil or ghee 14 g.
- Oil, ghee, butter and sugar cooked into a dish belong in that dish's per100g values. List them separately only when they are extras on the side.
- Recognise dishes from any cuisine, including home-style Indian food.
- Indian chai and South Indian filter coffee are made with milk and sugar (about 50-60 kcal per 100 ml) unless the person says black, no milk or no sugar.
- If nothing edible is described, return an empty items list.`;

const PHOTO_RULES = `${FOOD_RULES}
- You are looking at a photo. Judge portion sizes from plates, bowls, cups, cutlery and hands in the picture. If the photo shows no food or drink, return an empty items list.`;

export function foodMessages(text: string) {
  return [
    { role: "system" as const, content: FOOD_RULES },
    { role: "user" as const, content: `What I ate: ${text}` },
  ];
}

export function photoMessages(imageBase64: string, note: string) {
  const content = note
    ? `Estimate the food in this photo. Extra details from me: ${note}`
    : "Estimate the food in this photo.";
  return [
    { role: "system" as const, content: PHOTO_RULES },
    { role: "user" as const, content, images: [imageBase64] },
  ];
}

// ---------------------------------------------------------------- coach

function describeEntry(e: FoodEntry): string {
  return `${e.name}${e.portion ? ` (${e.portion})` : ""}: ${formatKcal(e.calories)} kcal, P ${round1(e.protein)} g, C ${round1(e.carbs)} g, F ${round1(e.fat)} g`;
}

/** Everything the coach needs to know, written out as plain text for the system prompt. */
export function coachSystemPrompt(state: AppState, date: string): string {
  const p = state.profile!;
  const t = p.targets;
  const activity = ACTIVITY_LEVELS.find((a) => a.id === p.activity)?.label ?? p.activity;
  const goal =
    p.goal === "maintain" ? "maintain weight" : `${p.goal === "lose" ? "lose" : "gain"} about ${p.pace} kg per week`;

  const dayEntries = state.entries.filter((e) => e.date === date);
  const eaten = dayTotals(state.entries, date);
  const mealLines = MEALS.map((m) => {
    const items = dayEntries.filter((e) => e.meal === m.id);
    return `- ${m.label}: ${items.length ? items.map(describeEntry).join("; ") : "nothing logged"}`;
  }).join("\n");

  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 7))
    .map((d) => {
      const tot = dayTotals(state.entries, d);
      return tot.calories > 0 ? `- ${d}: ${formatKcal(tot.calories)} kcal, protein ${Math.round(tot.protein)} g` : `- ${d}: not logged`;
    })
    .join("\n");

  const weights = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const recentWeights = weights.filter((w) => w.date >= addDays(date, -30) && w.date <= date);
  const weightLine = recentWeights.length
    ? `${recentWeights.map((w) => `${w.date}: ${w.kg} kg`).join(", ")}`
    : "no weigh-ins in the last 30 days";

  const now = new Date();
  const isToday = date === toISODate(now);
  const when = isToday
    ? `Today is ${longDate(date)} and it is ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} now, so suggestions should cover the rest of today.`
    : `The day being discussed is ${longDate(date)}.`;

  return `You are Bitewise Coach, a friendly and practical nutrition coach inside a diet tracking app.
${when}

About the person:
- ${p.name ? `Name: ${p.name}, ` : ""}${p.sex}, ${p.age} years, ${p.heightCm} cm, ${p.weightKg} kg
- Activity: ${activity}. Goal: ${goal}.
- Diet notes: ${p.dietNotes || "none given"}
- Daily targets: ${formatKcal(t.calories)} kcal, protein ${t.protein} g, carbs ${t.carbs} g, fat ${t.fat} g, water ${p.waterGoal} glasses

Food log for that day:
${mealLines}
Totals: ${formatKcal(eaten.calories)} kcal, protein ${Math.round(eaten.protein)} g, carbs ${Math.round(eaten.carbs)} g, fat ${Math.round(eaten.fat)} g.
Remaining: ${formatKcal(t.calories - eaten.calories)} kcal, protein ${Math.round(t.protein - eaten.protein)} g.
Water: ${state.water[date] ?? 0} of ${p.waterGoal} glasses.

The 7 days before:
${week}

Weight: ${weightLine}

How to answer:
- Be concise: a few short sentences or a short bullet list. Use **bold** only for key numbers.
- Ground advice in the log above and quote real numbers from it.
- Suggest specific foods with portions and rough calories/protein that fit the person's diet notes and usual cuisine.
- Be warm and encouraging, never judgmental. No crash diets, skipped meals or eating far below target.
- Food values in the log are AI estimates; mention that only when it matters.
- You are not a doctor. For medical conditions, pregnancy, medication questions or signs of disordered eating, gently suggest a doctor or registered dietitian.`;
}
