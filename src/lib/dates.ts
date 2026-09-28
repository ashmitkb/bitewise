import type { MealType } from "./types";

/** Local calendar date as YYYY-MM-DD (never UTC, so late-night meals land on the right day). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayISO = () => toISODate(new Date());

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Dates from (end - n + 1) to end, oldest first. */
export function lastNDates(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

export function dayLabel(iso: string, today = todayISO()): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function weekday(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: "short" });
}

export function longDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function mealForNow(date = new Date()): MealType {
  const h = date.getHours();
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 18 && h < 23) return "dinner";
  return "snack";
}
