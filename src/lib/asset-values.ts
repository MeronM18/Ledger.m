// Pure. What an asset you track yourself (cash, a car, property) was worth
// over time, so net worth counts it from the day you had it, not across
// the whole history at today's value. Each asset keeps dated values: the
// value it was entered at and each change since. On any day it's worth the
// latest value on or before that day, and nothing before its first.

import { addDays, daysBetween } from "@/lib/account-history";

export type ValuePoint = { date: string; value: number };
export type AssetValues = Record<string, ValuePoint[]>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const round = (n: number) => Math.round(n * 100) / 100;

/** The stored map, keeping only well-formed points, each asset's oldest first and one per day. */
export function resolveAssetValues(stored: unknown): AssetValues {
  if (!stored || typeof stored !== "object") return {};
  const out: AssetValues = {};
  for (const [id, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!Array.isArray(raw)) continue;
    const byDate = new Map<string, number>();
    for (const p of raw) {
      if (!p || typeof p !== "object") continue;
      const { date, value } = p as Record<string, unknown>;
      if (typeof date === "string" && ISO.test(date) && typeof value === "number" && Number.isFinite(value)) byDate.set(date, value);
    }
    const points = [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    if (points.length > 0) out[id] = points;
  }
  return out;
}

/** Its value on a day: the latest on or before it, or null before the first. */
export function valueOn(points: ValuePoint[], date: string): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.date > date) break;
    v = p.value;
  }
  return v;
}

/**
 * Its history with `value` on `date`: added, or replacing that day's. A
 * value the history already has on that day changes nothing.
 */
export function withValue(points: ValuePoint[], date: string, value: number): ValuePoint[] {
  const v = round(value);
  if (valueOn(points, date) === v) return points;
  return [...points.filter((p) => p.date !== date), { date, value: v }].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Its history with `delta` added from `date` on (cash spent or received on
 * that day). Never reaches back before the first value: before the asset
 * was entered there's nothing known to change.
 */
export function shifted(points: ValuePoint[], date: string, delta: number): ValuePoint[] {
  if (points.length === 0 || delta === 0) return points;
  const from = date < points[0].date ? points[0].date : date;
  const base = withValue(points, from, valueOn(points, from) as number);
  // withValue skips an unchanged day, so make sure the day itself is a point.
  const withDay = base.some((p) => p.date === from) ? base : [...base, { date: from, value: valueOn(base, from) as number }].sort((a, b) => a.date.localeCompare(b.date));
  return withDay.map((p) => (p.date >= from ? { ...p, value: round(p.value + delta) } : p));
}

/**
 * The history to count by: what's recorded, or for an asset with none yet,
 * its value now from the day it was added; and if its value has changed
 * since the last recorded one (an older change), the new value from the day
 * it changed.
 */
export function effectiveValues(recorded: ValuePoint[] | undefined, addedOn: string | null, current: number, updatedOn: string | null): ValuePoint[] {
  const points = recorded ?? [];
  if (points.length === 0) return addedOn ? [{ date: addedOn, value: round(current) }] : [];
  const last = points[points.length - 1];
  if (Math.abs(last.value - current) < 0.005) return points;
  const on = updatedOn && updatedOn > last.date ? updatedOn : last.date;
  return withValue(points, on, current);
}

/** Its value at the end of each day from `start` through `today`, oldest first; 0 before it was had. */
export function valueSeries(points: ValuePoint[], start: string, today: string): number[] {
  const days = Math.max(0, daysBetween(start, today));
  const out = new Array<number>(days + 1);
  for (let i = 0; i <= days; i++) out[i] = valueOn(points, addDays(start, i)) ?? 0;
  return out;
}
