import { requirePerson } from "@/lib/auth";
import { updateAndGetState, updatePeople } from "@/lib/db";
import { HttpError, isoDate, json, num, oneOf, readJson, route, str } from "@/lib/http";
import { ACTIVITY_LEVELS, planTargets, round1 } from "@/lib/nutrition";
import { targetsOnly, upsertWeight } from "@/lib/state-ops";
import type { Profile } from "@/lib/types";

export const PUT = route(async (req: Request) => {
  const id = await requirePerson(req);
  const b = await readJson(req);

  const goal = oneOf(b.goal, ["lose", "maintain", "gain"] as const, "Goal");
  const body = {
    sex: oneOf(b.sex, ["male", "female"] as const, "Sex"),
    age: Math.round(num(b.age, 13, 100, "Age")),
    heightCm: round1(num(b.heightCm, 120, 230, "Height (cm)")),
    weightKg: round1(num(b.weightKg, 30, 300, "Weight (kg)")),
    activity: oneOf(
      b.activity,
      ACTIVITY_LEVELS.map((a) => a.id),
      "Activity",
    ),
    goal,
    pace: goal === "maintain" ? 0 : num(b.pace, 0.1, 1, "Pace"),
  };

  const customTargets = b.customTargets === true;
  let targets = targetsOnly(planTargets(body));
  if (customTargets) {
    const t = (b.targets ?? {}) as Record<string, unknown>;
    targets = {
      calories: Math.round(num(t.calories, 800, 6000, "Calorie target")),
      protein: Math.round(num(t.protein, 0, 500, "Protein target")),
      carbs: Math.round(num(t.carbs, 0, 1000, "Carb target")),
      fat: Math.round(num(t.fat, 0, 400, "Fat target")),
    };
  }

  const profile: Profile = {
    name: str(b.name, 40),
    ...body,
    dietNotes: str(b.dietNotes, 300),
    targets,
    customTargets,
    waterGoal: Math.round(num(b.waterGoal ?? 8, 1, 20, "Water goal")),
  };
  if (b.date !== undefined && typeof b.date !== "string") throw new HttpError("date must be a string.");
  const date = b.date ? isoDate(b.date) : null;

  // The name on the form is also the profile's name on the "Who's using Bitewise?" screen.
  if (profile.name) {
    await updatePeople((file) => {
      const person = file.people.find((p) => p.id === id);
      const taken = file.people.some((p) => p.id !== id && p.name.toLowerCase() === profile.name.toLowerCase());
      if (person && !taken) person.name = profile.name;
    });
  }
  const state = await updateAndGetState(id, (data) => {
    data.profile = profile;
    // Log the weight from the form as today's weigh-in when it's new information.
    if (date) {
      const latest = data.weights.at(-1);
      if (!latest || latest.kg !== profile.weightKg || latest.date === date) upsertWeight(data, date, profile.weightKg);
    }
  });
  return json(state);
});
