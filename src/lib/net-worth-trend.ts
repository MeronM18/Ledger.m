// Pure, dependency-free. Turns the daily net worth snapshots into the
// overview's headline: the change over the last 30 days and a sparkline.

export type Snapshot = { date: string; net_worth: number };

export type NetWorthTrend = {
  // Net worth now minus its value about `days` ago; null with too little history to say.
  change: number | null;
  changePct: number | null; // null when the starting point was 0
  // Oldest to newest, ending on today's live figure, for the sparkline.
  values: number[];
};

const MIN_HISTORY_DAYS = 7;
const SPARKLINE_DAYS = 90;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000);
}

/**
 * Change over `days`, measured from the latest snapshot on or before that
 * date. With no snapshot that old (a young history), the earliest one
 * stands in, but only if it's at least a week old: "up $12 since yesterday"
 * dressed up as a 30-day figure would mislead.
 */
export function netWorthTrend(
  snapshots: Snapshot[],
  currentNetWorth: number,
  todayIso: string,
  days = 30
): NetWorthTrend {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const recent = sorted.filter((s) => daysBetween(s.date, todayIso) <= SPARKLINE_DAYS && s.date <= todayIso);
  const values = recent.map((s) => s.net_worth);
  // Today's live figure always ends the line, replacing a same-day snapshot.
  if (recent.length > 0 && recent[recent.length - 1].date === todayIso) values.pop();
  values.push(currentNetWorth);

  const cutoff = sorted.filter((s) => daysBetween(s.date, todayIso) >= days).at(-1);
  const earliest = sorted[0];
  const baseline =
    cutoff ?? (earliest && daysBetween(earliest.date, todayIso) >= MIN_HISTORY_DAYS ? earliest : undefined);

  if (!baseline) return { change: null, changePct: null, values };

  const change = currentNetWorth - baseline.net_worth;
  const changePct = baseline.net_worth !== 0 ? change / Math.abs(baseline.net_worth) : null;
  return { change, changePct, values };
}

/**
 * SVG path for a sparkline in a `width` x `height` box with `pad` on every
 * side. Null with fewer than two points; a flat series draws a centered
 * line rather than dividing by zero.
 */
export function sparklinePath(values: number[], width: number, height: number, pad = 2): string | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * innerW;
      const y = range === 0 ? height / 2 : pad + (1 - (v - min) / range) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
