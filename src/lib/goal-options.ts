// Pure. What a goal is set to beyond its row in savings_goals, kept by goal
// id in ui_preferences: how it looks (an icon and a color you pick) and how
// the accounts it follows count toward it.
//
// Tracking:
// - "balance": the accounts' whole balances, or a share of each (so one
//   savings account can hold several goals, e.g. 60% here, 40% there).
// - "growth": only what's been added since the goal started. The balances
//   when it started are kept as a baseline and taken off.
// A goal that follows no accounts is tracked by hand, as before.

export const GOAL_ICONS = [
  "piggy-bank",
  "shield",
  "plane",
  "house",
  "car",
  "briefcase",
  "graduation",
  "gift",
  "laptop",
  "heart",
  "baby",
  "paw",
  "ring",
  "umbrella",
  "trending",
  "sparkles",
] as const;
export type GoalIcon = (typeof GOAL_ICONS)[number];

// Theme tokens only, so every goal sits in the site's palette.
export const GOAL_COLORS = ["champagne", "moss", "travel", "entertainment", "shopping", "food", "home", "medical"] as const;
export type GoalColor = (typeof GOAL_COLORS)[number];

export function colorVar(color: GoalColor): string {
  if (color === "champagne") return "var(--champagne)";
  if (color === "moss") return "var(--moss)";
  return `var(--cat-${color})`;
}

export type GoalTracking = "balance" | "growth";

export type GoalOptions = {
  icon: GoalIcon | null;
  color: GoalColor | null;
  tracking: GoalTracking;
  // Percent (1-100) of an account that counts, by ref; missing means all of it.
  shares: Record<string, number>;
  // Growth: each account's balance when the goal started following it.
  baselines: Record<string, number>;
  since: string | null;
};

export const DEFAULT_OPTIONS: GoalOptions = { icon: null, color: null, tracking: "balance", shares: {}, baselines: {}, since: null };

function numberMap(raw: unknown, valid: (n: number) => boolean): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && valid(v)) out[k] = v;
  }
  return out;
}

export function resolveGoalOptions(stored: unknown): Record<string, GoalOptions> {
  if (!stored || typeof stored !== "object") return {};
  const out: Record<string, GoalOptions> = {};
  for (const [id, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    out[id] = {
      icon: (GOAL_ICONS as readonly unknown[]).includes(r.icon) ? (r.icon as GoalIcon) : null,
      color: (GOAL_COLORS as readonly unknown[]).includes(r.color) ? (r.color as GoalColor) : null,
      tracking: r.tracking === "growth" ? "growth" : "balance",
      shares: numberMap(r.shares, (n) => n > 0 && n <= 100),
      baselines: numberMap(r.baselines, () => true),
      since: typeof r.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.since) ? r.since : null,
    };
  }
  return out;
}

/**
 * What an account counts toward a goal: a share of its balance, less its
 * starting balance when only growth counts. `transactions` are scaled by
 * the same share, so the goal's history and pace stay in step with it.
 */
export function countedAccount<T extends { amount: number }>(
  ref: string,
  balance: number,
  transactions: T[],
  options: GoalOptions
): { balance: number; transactions: T[] } {
  const share = (options.shares[ref] ?? 100) / 100;
  const baseline = options.tracking === "growth" ? (options.baselines[ref] ?? balance) * share : 0;
  return {
    balance: Math.round((balance * share - baseline) * 100) / 100,
    transactions: share === 1 ? transactions : transactions.map((t) => ({ ...t, amount: Math.round(t.amount * share * 100) / 100 })),
  };
}

/**
 * Baselines when a goal is saved in growth mode: kept for accounts it
 * already followed, today's balance for ones newly added, none for ones
 * dropped.
 */
export function nextBaselines(refs: string[], previous: Record<string, number>, balances: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ref of refs) {
    const kept = previous[ref];
    if (kept !== undefined) out[ref] = kept;
    else if (balances.has(ref)) out[ref] = balances.get(ref)!;
  }
  return out;
}
