// Pure, dependency-free. Turns the daily net worth snapshots into the
// overview's headline: the change over the last 30 days and a sparkline.

export type Snapshot = { date: string; net_worth: number };

export type NetWorthTrend = {
  // Net worth now minus its value about `days` ago, or, with a younger
  // history, since the first snapshot; null with no earlier day to compare.
  change: number | null;
  // The day the change is measured from when that isn't a full `days` ago
  // ("since Sep 20"); null when it is.
  since: string | null;
  changePct: number | null; // null when the starting point was 0
  // Oldest to newest, ending on today's live figure, for the sparkline.
  values: number[];
};

const SPARKLINE_DAYS = 90;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000);
}

/**
 * Change over `days`, measured from the latest snapshot on or before that
 * date. With no snapshot that old (a young history), the change is since
 * the earliest one, and `since` says from when, so a few days of history
 * isn't dressed up as a 30-day figure.
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
  const earliest = sorted.find((s) => s.date < todayIso);
  const baseline = cutoff ?? earliest;

  if (!baseline) return { change: null, changePct: null, since: null, values };

  const change = currentNetWorth - baseline.net_worth;
  const changePct = baseline.net_worth !== 0 ? change / Math.abs(baseline.net_worth) : null;
  return { change, changePct, since: cutoff ? null : baseline.date, values };
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
