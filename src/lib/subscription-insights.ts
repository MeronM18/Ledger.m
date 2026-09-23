import { formatCurrency } from "@/lib/format";
import { monthlyFactorForFrequency } from "@/lib/plaid-categories";
import { stepDate, toDateString } from "@/lib/subscriptions-aggregation";

// Pure, dependency-free. Everything here is a heuristic over data Plaid
// already gave us; each result is phrased as "worth a look", never as a
// certainty.

const KNOWN_FREQUENCIES = new Set(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY"]);

/**
 * The next expected charge. Plaid sometimes has no predicted_next_date
 * (an annual fee seen once, for example); when the last charge date and a
 * real cadence are known, it's one period after that. An unknown cadence
 * gets no guess rather than a wrong monthly one.
 */
export function effectiveNextDate(
  predicted: string | null,
  lastDate: string | null,
  frequency: string | null
): string | null {
  if (predicted) return predicted;
  if (!lastDate || !frequency || !KNOWN_FREQUENCIES.has(frequency)) return null;
  return toDateString(stepDate(new Date(`${lastDate}T00:00:00`), frequency));
}

const NEW_SUBSCRIPTION_DAYS = 45;

/** First seen within the last 45 days. */
export function isNewSubscription(firstDate: string | null, todayIso: string): boolean {
  if (!firstDate) return false;
  const days = (new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${firstDate}T00:00:00`).getTime()) / 86_400_000;
  return days >= 0 && days <= NEW_SUBSCRIPTION_DAYS;
}

const TRIAL_MAX_FIRST_CHARGE = 1;
const TRIAL_MIN_REGULAR_CHARGE = 5;

/**
 * A subscription that began with a token charge ($1 or less) and now bills
 * $5 or more looks like a trial that converted to full price. Returns the
 * opening charge, or null when it doesn't fit.
 */
export function trialStart(firstChargeAmount: number | null, averageAmount: number | null): { firstAmount: number } | null {
  if (firstChargeAmount === null || averageAmount === null) return null;
  const first = Math.abs(firstChargeAmount);
  if (first <= TRIAL_MAX_FIRST_CHARGE && Math.abs(averageAmount) >= TRIAL_MIN_REGULAR_CHARGE) return { firstAmount: first };
  return null;
}

export function cancelSearchUrl(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${name} subscription`)}`;
}

export type InsightItem = {
  key: string;
  name: string;
  source: "plaid" | "manual";
  amount: number;
  frequency: string | null;
  // Plaid's detailed category, when there is one (manual entries have none).
  categoryDetailed?: string | null;
};

export type Insight = {
  kind: "duplicate" | "overlap";
  title: string;
  detail: string;
  keys: string[];
};

/** Lowercase letters and digits only, so "ChatGPT Plus" and "CHATGPT-PLUS" compare equal. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sameService(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.includes(short);
}

const monthlyCost = (i: InsightItem) => i.amount * monthlyFactorForFrequency(i.frequency);

/**
 * The same service listed more than once, e.g. a bank-detected charge plus a
 * manual entry for it (which would count its cost twice), or the same
 * merchant on two cards. Connected groups: A~B and B~C gives one group.
 */
export function findDuplicates(items: InsightItem[], currency: string): Insight[] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const norm = items.map((i) => normalizeName(i.name));

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (norm[i] && norm[j] && sameService(norm[i], norm[j])) parent[find(i)] = find(j);
    }
  }

  const groups = new Map<number, InsightItem[]>();
  items.forEach((item, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), item]);
  });

  return Array.from(groups.values())
    .filter((g) => g.length >= 2)
    .map((g) => {
      const mixed = g.some((i) => i.source === "manual") && g.some((i) => i.source === "plaid");
      return {
        kind: "duplicate" as const,
        title: `${g[0].name} may be listed twice`,
        detail: mixed
          ? `It appears both from your bank and as a manual entry, so its ${formatCurrency(g.reduce((s, i) => s + monthlyCost(i), 0), currency)} a month is being counted more than once. Delete whichever entry you don't need.`
          : `${g.length} active entries look like the same service, together ${formatCurrency(g.reduce((s, i) => s + monthlyCost(i), 0), currency)} a month.`,
        keys: g.map((i) => i.key),
      };
    });
}

const OVERLAP_FAMILIES: Record<string, string> = {
  ENTERTAINMENT_TV_AND_MOVIES: "video streaming",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "music and audio",
  ENTERTAINMENT_VIDEO_GAMES: "gaming",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "gym and fitness",
};

/** Two or more active subscriptions serving the same purpose, by Plaid's own category. */
export function findOverlaps(items: InsightItem[], currency: string): Insight[] {
  const byFamily = new Map<string, InsightItem[]>();
  for (const item of items) {
    const family = item.categoryDetailed ? OVERLAP_FAMILIES[item.categoryDetailed] : undefined;
    if (!family) continue;
    byFamily.set(family, [...(byFamily.get(family) ?? []), item]);
  }

  return Array.from(byFamily.entries())
    .filter(([, group]) => group.length >= 2)
    .map(([family, group]) => ({
      kind: "overlap" as const,
      title: `${group.length} ${family} subscriptions`,
      detail: `${group.map((i) => i.name).join(", ")} cost ${formatCurrency(group.reduce((s, i) => s + monthlyCost(i), 0), currency)} a month together. Worth checking you use all of them.`,
      keys: group.map((i) => i.key),
    }));
}

export function subscriptionInsights(items: InsightItem[], currency: string): Insight[] {
  return [...findDuplicates(items, currency), ...findOverlaps(items, currency)];
}
