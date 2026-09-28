"use client";

import { useCallback, useState } from "react";
import { dayLabel, parseISODate, shortDate, weekday } from "@/lib/dates";
import { formatKcal, round1 } from "@/lib/nutrition";
import type { Nutrients, WeightEntry } from "@/lib/types";
import { MACROS } from "./meters";

/** Width of an element, kept up to date with ResizeObserver. */
function useWidth<T extends HTMLElement>(): [(node: T | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Round axis ticks: 0 / 500 / 1,000 … */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}

function niceRange(min: number, max: number, count: number): number[] {
  const step = niceStep(Math.max(max - min, 1e-6), count);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Bar with a rounded data end and a square foot on the baseline. */
function barPath(x: number, y: number, w: number, h: number, radius: number): string {
  if (h <= 0) return "";
  const r = Math.min(radius, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Sits beside the hovered point (right of it on the left half, left of it on the right half). */
function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const w = 168;
  const left = x < width / 2 ? x + 12 : x - w - 12;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg"
      style={{ left: Math.max(0, Math.min(left, width - w)), width: w }}
    >
      {children}
    </div>
  );
}

function arrowKeyHandler(count: number, setActive: (i: number | null) => void, active: number | null) {
  return (event: React.KeyboardEvent) => {
    const current = active ?? count - 1;
    const next =
      event.key === "ArrowLeft" ? current - 1 : event.key === "ArrowRight" ? current + 1 : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(count - 1, next)));
  };
}

export interface DayTotals extends Nutrients {
  date: string;
}

/** Calories per day as columns, with the daily target as a reference line. */
export function CaloriesChart({ days, target }: { days: DayTotals[]; target: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = arrowKeyHandler(days.length, setActive, active);

  const height = 232;
  const m = { top: 44, right: 8, bottom: 28, left: 44 };
  const plotW = Math.max(0, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;
  const ticks = niceRange(0, Math.max(target, ...days.map((d) => d.calories)) * 1.05, 4);
  const max = ticks[ticks.length - 1] || 1;
  const y = (v: number) => m.top + plotH - (v / max) * plotH;
  const band = plotW / Math.max(days.length, 1);
  const barW = Math.max(2, Math.min(24, band - 2));
  const x = (i: number) => m.left + band * i + band / 2;
  const labelEvery = days.length <= 7 ? 1 : Math.ceil(days.length / 6);

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.floor((event.clientX - rect.left - m.left) / band);
    setActive(i >= 0 && i < days.length ? i : null);
  };

  const a = active !== null ? days[active] : null;

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Calories per day for the last ${days.length} days, with your ${formatKcal(target)} kcal target. Use arrow keys to read each day.`}
          tabIndex={0}
          className="block touch-pan-y outline-offset-4"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(days.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-strong)" : "var(--line)"} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-muted text-[11px]">
                {t.toLocaleString()}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            d.calories > 0 ? (
              <path
                key={d.date}
                d={barPath(x(i) - barW / 2, y(d.calories), barW, y(0) - y(d.calories), 4)}
                fill="var(--brand)"
                opacity={active === null || active === i ? 1 : 0.45}
              />
            ) : null,
          )}
          <line x1={m.left} x2={width - m.right} y1={y(target)} y2={y(target)} stroke="var(--ink-2)" strokeWidth={1.25} strokeDasharray="5 4" />
          <text x={width - m.right} y={y(target) - 6} textAnchor="end" className="fill-ink-2 text-[11px] font-medium">
            Target {formatKcal(target)}
          </text>
          {days.map((d, i) =>
            (days.length - 1 - i) % labelEvery === 0 ? (
              <text key={d.date} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
                {days.length <= 7 ? weekday(d.date) : shortDate(d.date)}
              </text>
            ) : null,
          )}
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={m.top} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} pointerEvents="none" />
          )}
        </svg>
      )}
      {a && active !== null && (
        <Tooltip x={x(active)} width={width}>
          <div className="text-xs text-muted">{dayLabel(a.date)}</div>
          {a.calories > 0 ? (
            <>
              <div className="font-semibold">{formatKcal(a.calories)} kcal</div>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
                {MACROS.map((mac) => (
                  <li key={mac.key} className="flex items-center gap-2">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: mac.color }} aria-hidden="true" />
                    <span className="font-semibold text-ink">{Math.round(a[mac.key])} g</span> {mac.label.toLowerCase()}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-ink-2">Nothing logged</div>
          )}
        </Tooltip>
      )}
    </div>
  );
}

const DAY_MS = 86_400_000;

/** Weight over time as a line with a dot per weigh-in. */
export function WeightChart({ points, start, end }: { points: WeightEntry[]; start: string; end: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = arrowKeyHandler(points.length, setActive, active);

  if (points.length === 0) {
    return <p className="rounded-xl bg-surface-2 px-4 py-8 text-center text-sm text-ink-2">No weigh-ins in this period yet.</p>;
  }

  const height = 212;
  const m = { top: 44, right: 56, bottom: 28, left: 44 };
  const plotW = Math.max(0, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;
  const t0 = parseISODate(start).getTime();
  const span = Math.max(parseISODate(end).getTime() - t0, DAY_MS);
  const x = (date: string) => m.left + ((parseISODate(date).getTime() - t0) / span) * plotW;
  const kgs = points.map((p) => p.kg);
  const ticks = niceRange(Math.min(...kgs) - 0.5, Math.max(...kgs) + 0.5, 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (kg: number) => m.top + plotH - ((kg - lo) / (hi - lo || 1)) * plotH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.kg)}`).join("");
  const last = points[points.length - 1];
  const first = points[0];

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    });
    setActive(best);
  };

  const a = active !== null ? points[active] : null;
  const dateTicks = [start, end];

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Weight from ${shortDate(first.date)} (${first.kg} kg) to ${shortDate(last.date)} (${last.kg} kg). Use arrow keys to read each weigh-in.`}
          tabIndex={0}
          className="block touch-pan-y outline-offset-4"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-muted text-[11px]">
                {t}
              </text>
            </g>
          ))}
          {dateTicks.map((d, i) => (
            <text key={d} x={x(d)} y={height - 8} textAnchor={i === 0 ? "start" : "end"} className="fill-muted text-[11px]">
              {shortDate(d)}
            </text>
          ))}
          {a && <line x1={x(a.date)} x2={x(a.date)} y1={m.top} y2={height - m.bottom} stroke="var(--line-strong)" />}
          <path d={path} fill="none" stroke="var(--weight)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) =>
            points.length <= 31 || i === points.length - 1 || i === active ? (
              <circle
                key={p.date}
                cx={x(p.date)}
                cy={y(p.kg)}
                r={i === active ? 5.5 : 4}
                fill="var(--weight)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ) : null,
          )}
          <text x={x(last.date) + 10} y={y(last.kg)} dy="0.32em" className="fill-ink text-xs font-semibold">
            {last.kg} kg
          </text>
        </svg>
      )}
      {a && active !== null && (
        <Tooltip x={x(a.date)} width={width}>
          <div className="text-xs text-muted">{dayLabel(a.date)}</div>
          <div className="font-semibold">{a.kg} kg</div>
          {active > 0 && (
            <div className="text-xs text-ink-2">
              {round1(a.kg - first.kg) > 0 ? "+" : ""}
              {round1(a.kg - first.kg)} kg since {shortDate(first.date)}
            </div>
          )}
        </Tooltip>
      )}
    </div>
  );
}
