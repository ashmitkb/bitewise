import { formatKcal } from "@/lib/nutrition";
import type { Nutrients, Targets } from "@/lib/types";

export const MACROS = [
  { key: "protein", label: "Protein", color: "var(--protein)" },
  { key: "carbs", label: "Carbs", color: "var(--carbs)" },
  { key: "fat", label: "Fat", color: "var(--fat)" },
] as const;

/** Calories eaten vs target. The number in the middle is what's left (or how far over). */
export function CalorieRing({ eaten, target, size = 184 }: { eaten: number; target: number; size?: number }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const over = eaten > target;
  const fraction = target > 0 ? Math.min(eaten / target, 1) : 0;
  const left = Math.round(target - eaten);
  const label = over
    ? `${formatKcal(eaten)} of ${formatKcal(target)} kcal eaten, ${formatKcal(-left)} over target`
    : `${formatKcal(eaten)} of ${formatKcal(target)} kcal eaten, ${formatKcal(left)} left`;

  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--brand)" strokeOpacity={0.16} strokeWidth={stroke} />
        {eaten > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={over ? "var(--serious)" : "var(--brand)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
        <span className="text-5xl font-bold leading-none tracking-tight">{formatKcal(Math.abs(left))}</span>
        <span className="mt-1.5 text-sm text-ink-2">{over ? "kcal over" : "kcal left"}</span>
      </div>
    </div>
  );
}

/** Protein / carbs / fat as three labelled meters. */
export function MacroMeters({ eaten, targets, note = "left" }: { eaten: Nutrients; targets: Targets; note?: "left" | "none" }) {
  return (
    <ul className="space-y-4">
      {MACROS.map((m) => {
        const value = eaten[m.key];
        const target = targets[m.key];
        const fraction = target > 0 ? Math.min(value / target, 1) : 0;
        const diff = Math.round(target - value);
        return (
          <li key={m.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                {m.label}
              </span>
              <span className="tabular text-ink-2">
                <span className="font-semibold text-ink">{Math.round(value)}</span> / {target} g
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ background: `color-mix(in srgb, ${m.color} 18%, transparent)` }}
              role="meter"
              aria-label={m.label}
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={Math.round(value)}
              aria-valuetext={`${Math.round(value)} of ${target} grams`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${fraction * 100}%`, background: m.color, transition: "width 0.6s ease" }}
              />
            </div>
            {note === "left" && (
              <p className="mt-1 text-xs text-muted">{diff >= 0 ? `${diff} g to go` : `${-diff} g over`}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
