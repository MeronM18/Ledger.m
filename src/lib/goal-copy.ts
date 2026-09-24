// Pure. How a goal's insight (goal-insights.ts) is put into words, shared by
// the Goals page and the overview card so they never disagree.

import { daysBetween } from "@/lib/account-history";
import type { GoalInsight, Verdict } from "@/lib/goal-insights";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "$1,585": forecasts and plans are estimates, so no cents. */
export function dollars(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));
}

/** "Jul 15", or "Jul 15, 2025" outside this year. */
export function shortDate(iso: string, todayIso: string): string {
  const sameYear = iso.slice(0, 4) === todayIso.slice(0, 4);
  return at(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** "Dec 31, 2026". */
export function fullDate(iso: string): string {
  return at(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * A forecast date only as precise as a forecast is: the day within about
 * three months, the month after that.
 */
export function roughDate(iso: string, todayIso: string): string {
  if (daysBetween(todayIso, iso) <= 92) return shortDate(iso, todayIso);
  return at(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "5 weeks", "3 months": how far apart two days are, roughly. */
export function roughGap(fromIso: string, toIso: string): string {
  const days = Math.abs(daysBetween(fromIso, toIso));
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 63) return `${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30.44);
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** "the last 3 months", or "since Jul 2" when there's less history than that. */
export function paceWindow(since: string, todayIso: string): string {
  return daysBetween(since, todayIso) >= 88 ? "the last 3 months" : `since ${shortDate(since, todayIso)}`;
}

export const VERDICT: Record<Verdict, { label: string; tone: "good" | "bad" | "quiet" }> = {
  reached: { label: "Reached", tone: "good" },
  ahead: { label: "Ahead of pace", tone: "good" },
  "on-pace": { label: "On pace", tone: "good" },
  behind: { label: "Behind pace", tone: "bad" },
  stalled: { label: "Not growing", tone: "bad" },
  overdue: { label: "Past its date", tone: "bad" },
  open: { label: "No date set", tone: "quiet" },
  unknown: { label: "No pace yet", tone: "quiet" },
};

/** The overview's one line: where the goal stands and, if it's moving, when it lands. Null when there's nothing to read. */
export function verdictLine(insight: GoalInsight, todayIso: string): string | null {
  const { verdict, reachDate } = insight;
  if (verdict === "unknown") return null;
  const label = VERDICT[verdict].label;
  if (verdict === "reached") {
    const done = insight.milestones.at(-1)?.date;
    return done ? `Reached ${shortDate(done, todayIso)}` : label;
  }
  if (reachDate && (verdict === "ahead" || verdict === "on-pace" || verdict === "behind" || verdict === "open")) {
    return `${label} · there around ${roughDate(reachDate, todayIso)}`;
  }
  return label;
}
