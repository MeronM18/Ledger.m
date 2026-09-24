// Pure. The axes of a chart with one value a day, like the net worth line.
//
// The x axis is time itself, not a label per point: a line two years long
// has two "May 17"s, and a chart keyed on labels takes the pointer on the
// later one to the earlier one. Its ticks sit on calendar boundaries and
// say the year once they're months apart. The y axis steps in round
// amounts ($70K, $75K, $80K) that bracket the line.

const DAY_MS = 86_400_000;

export type DayPoint = {
  // The day's midnight, UTC, in milliseconds: its place on the x axis.
  t: number;
  date: string;
  value: number;
};

/** One point a day, oldest first, the first on `firstIso`. */
export function dayPoints(values: number[], firstIso: string): DayPoint[] {
  const start = Date.parse(`${firstIso}T00:00:00Z`);
  return values.map((value, i) => {
    const t = start + i * DAY_MS;
    return { t, date: new Date(t).toISOString().slice(0, 10), value };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Round-number ticks from at or below `min` to at or above `max`, as close
 * to `gaps` steps apart as a step of 1, 2, 2.5 or 5 (times a power of ten)
 * allows.
 */
export function valueTicks(min: number, max: number, gaps = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max < min) [min, max] = [max, min];
  if (max - min < 0.01) {
    // A flat line still gets an axis, with room above and below it.
    const pad = Math.max(1, Math.abs(max) * 0.02);
    min -= pad;
    max += pad;
  }
  const magnitude = 10 ** Math.floor(Math.log10((max - min) / gaps));
  let best = { step: 0, lo: 0, count: Infinity };
  for (const m of [magnitude / 10, magnitude, magnitude * 10]) {
    for (const f of [1, 2, 2.5, 5]) {
      const step = f * m;
      const lo = Math.floor(min / step) * step;
      const count = Math.round((Math.ceil(max / step) * step - lo) / step);
      // Steps are tried smallest first, so a tie keeps the finer one.
      if (Math.abs(count - gaps) < Math.abs(best.count - gaps)) best = { step, lo, count };
    }
  }
  return Array.from({ length: best.count + 1 }, (_, i) => round(best.lo + i * best.step));
}

// How many decimals `n` needs to be written exactly, up to 6.
function decimalsOf(n: number): number {
  for (let d = 0; d < 6; d++) {
    const scaled = n * 10 ** d;
    if (Math.abs(Math.round(scaled) - scaled) < 1e-6) return d;
  }
  return 6;
}

/**
 * A tick's amount, short: "$72.5K". Decimals as the gap between ticks needs
 * them, so $80,250 in steps of $250 reads $80.25K, not $80.3K.
 */
export function formatTickMoney(value: number, step: number, currency = "USD"): string {
  const abs = Math.abs(value);
  const unit = abs >= 1e12 ? 1e12 : abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(2, decimalsOf(Math.abs(step) / unit)),
  }).format(value);
}

type Every = { days: number } | { halfMonths: true } | { months: number };

// Finest first. Weeks start on Monday; months line up with the year, so
// every 3 months is Jan, Apr, Jul, Oct.
const EVERY: Every[] = [
  { days: 1 },
  { days: 2 },
  { days: 7 },
  { halfMonths: true },
  { months: 1 },
  { months: 2 },
  { months: 3 },
  { months: 6 },
  { months: 12 },
  { months: 24 },
  { months: 60 },
];

// 1970-01-01 was a Thursday, so Mondays are the days 4 past a multiple of 7.
const MONDAY = 4;

function ticksFor(every: Every, from: number, to: number): number[] {
  const out: number[] = [];
  if ("days" in every) {
    const offset = every.days === 7 ? MONDAY : 0;
    for (let day = Math.ceil(from / DAY_MS); day * DAY_MS <= to; day++) {
      if ((((day - offset) % every.days) + every.days) % every.days === 0) out.push(day * DAY_MS);
    }
    return out;
  }
  const start = new Date(from);
  for (let m = start.getUTCFullYear() * 12 + start.getUTCMonth(); ; m++) {
    const year = Math.floor(m / 12);
    const month = m % 12;
    if (Date.UTC(year, month, 1) > to) return out;
    const days = "halfMonths" in every ? [1, 15] : m % every.months === 0 ? [1] : [];
    for (const d of days) {
      const t = Date.UTC(year, month, d);
      if (t >= from && t <= to) out.push(t);
    }
  }
}

const monthDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthYear = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Where to mark the x axis between two days (as `t`s): the finest calendar
 * boundaries that give no more than `max` ticks, labeled "Sep 7" when
 * they're days apart and "Sep 2025" when they're months apart.
 */
export function dateTicks(from: number, to: number, max = 8): { ticks: number[]; label: (t: number) => string } {
  for (const every of EVERY) {
    const ticks = ticksFor(every, from, to);
    if (ticks.length <= max) return { ticks, label: "months" in every ? monthYear : monthDay };
  }
  return { ticks: [from, to], label: monthYear };
}
