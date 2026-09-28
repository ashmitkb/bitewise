export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type EntrySource = "text" | "photo" | "manual";

export const MEALS: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snacks" },
];

export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Targets = Nutrients;

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  /** kg per week, 0 when maintaining */
  pace: number;
  dietNotes: string;
  targets: Targets;
  customTargets: boolean;
  /** glasses of 250 ml */
  waterGoal: number;
}

/** What the profile form submits: targets are only sent when customTargets is on. */
export type ProfileInput = Omit<Profile, "targets"> & { targets?: Targets };

export interface FoodEntry extends Nutrients {
  id: string;
  /** local date, YYYY-MM-DD */
  date: string;
  meal: MealType;
  name: string;
  portion: string;
  grams: number | null;
  /** nutrition per 100 g, so the portion can be re-weighed later; null for manual entries */
  per100g: Nutrients | null;
  source: EntrySource;
  photoId: string | null;
  createdAt: string;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export interface Settings {
  /** empty string = pick automatically from installed models */
  textModel: string;
  visionModel: string;
}

/** One person's own data: body profile, food log, weigh-ins, water. */
export interface UserData {
  profile: Profile | null;
  entries: FoodEntry[];
  weights: WeightEntry[];
  /** date -> glasses */
  water: Record<string, number>;
}

/** Someone who uses this app. Each person has their own UserData, optionally behind a PIN. */
export interface Person {
  id: string;
  name: string;
  pin: { salt: string; hash: string } | null;
  createdAt: string;
}

/** What the profile picker may show before anyone has signed in. */
export interface PersonSummary {
  id: string;
  name: string;
  hasPin: boolean;
}

/** Everything the signed-in person's browser gets. */
export interface AppState extends UserData {
  version: 2;
  me: PersonSummary;
  /** how many profiles exist on this computer */
  peopleCount: number;
  /** shared by everyone: which AI models this computer uses */
  settings: Settings;
}

/** One food the AI found, editable before saving. */
export interface FoodDraft {
  key: string;
  name: string;
  portion: string;
  grams: number;
  per100g: Nutrients;
  confidence: "high" | "medium" | "low";
}

/** Item sent to POST /api/entries */
export interface NewEntryItem extends Nutrients {
  name: string;
  portion: string;
  grams: number | null;
  per100g: Nutrients | null;
  source: EntrySource;
  /** attach the meal photo sent with the request to this item */
  withPhoto?: boolean;
}

export interface ModelInfo {
  name: string;
  sizeGB: number;
  capabilities: string[];
}

export interface AiStatus {
  online: boolean;
  error?: string;
  version?: string;
  installed: ModelInfo[];
  loaded: string[];
  textModel: string | null;
  visionModel: string | null;
  /** same Wi-Fi */
  lanUrls: string[];
  /** from anywhere, through Tailscale */
  tailscaleUrls: string[];
}

export type AnalyzeEvent =
  | { type: "status"; message: string }
  | { type: "found"; names: string[] }
  | { type: "result"; items: FoodDraft[]; model: string }
  | { type: "error"; message: string };

export type CoachEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "error"; message: string };
