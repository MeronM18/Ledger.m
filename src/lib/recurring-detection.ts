import { normalizeName } from "@/lib/subscription-insights";
import { stepDate, toDateString } from "@/lib/subscriptions-aggregation";

// Pure, dependency-free. Plaid detects recurring charges on connected
// accounts; an imported card (Apple Card) has no such feed, so this finds the
// same thing in its transactions: a merchant charging on a steady rhythm.

export type Charge = { date: string; name: string; amount: number };

export type DetectedSubscription = {
  name: string;
  amount: number; // the fixed price, or the typical one when it varies
  amountVaries: boolean;
  frequency: "WEEKLY" | "MONTHLY" | "ANNUALLY";
  occurrences: number;
  lastDate: string;
  nextDate: string;
};

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The cadence a list of charge dates follows, or null. Most gaps must fit, so one skipped month doesn't sink it. */
export function cadenceOf(dates: string[]): "WEEKLY" | "MONTHLY" | "ANNUALLY" | null {
  const sorted = Array.from(new Set(dates)).sort();
  if (sorted.length < 2) return null;
  const gaps = sorted.slice(1).map((d, i) => days(sorted[i], d));
  const share = (lo: number, hi: number) => gaps.filter((g) => g >= lo && g <= hi).length / gaps.length;

  if (sorted.length >= 4 && share(6, 8) >= 0.7) return "WEEKLY";
  if (sorted.length >= 3 && share(26, 35) >= 0.7) return "MONTHLY";
  if (sorted.length >= 2 && share(350, 380) >= 1) return "ANNUALLY";
  return null;
}

function next(lastDate: string, frequency: DetectedSubscription["frequency"]): string {
  return toDateString(stepDate(new Date(`${lastDate}T00:00:00`), frequency));
}

/**
 * Charges (purchases only, positive amounts) that repeat on a steady
 * rhythm. A fixed-price charge is matched first (three $2.99 charges a month
 * apart); a merchant whose amount changes each time (a usage-based bill) is
 * matched on its dates alone, but only when it charges about once per period,
 * so a merchant with many unrelated purchases isn't mistaken for a bill.
 */
export function detectRecurring(charges: Charge[]): DetectedSubscription[] {
  const byMerchant = new Map<string, Charge[]>();
  for (const c of charges) {
    if (!(c.amount > 0)) continue;
    const key = normalizeName(c.name);
    if (!key) continue;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), c]);
  }

  const found: DetectedSubscription[] = [];

  for (const group of byMerchant.values()) {
    const name = group[0].name;
    const fixed = new Map<string, Charge[]>();
    for (const c of group) fixed.set(c.amount.toFixed(2), [...(fixed.get(c.amount.toFixed(2)) ?? []), c]);

    let foundFixed = false;
    for (const [amount, list] of fixed) {
      const frequency = cadenceOf(list.map((c) => c.date));
      if (!frequency) continue;
      const dates = Array.from(new Set(list.map((c) => c.date))).sort();
      found.push({
        name,
        amount: Number(amount),
        amountVaries: false,
        frequency,
        occurrences: dates.length,
        lastDate: dates[dates.length - 1],
        nextDate: next(dates[dates.length - 1], frequency),
      });
      foundFixed = true;
    }
    if (foundFixed) continue;

    const dates = Array.from(new Set(group.map((c) => c.date))).sort();
    const perDate = group.length / dates.length;
    const frequency = dates.length >= 4 && perDate <= 1.25 ? cadenceOf(dates) : null;
    if (frequency) {
      found.push({
        name,
        amount: Math.round(median(group.map((c) => c.amount)) * 100) / 100,
        amountVaries: true,
        frequency,
        occurrences: dates.length,
        lastDate: dates[dates.length - 1],
        nextDate: next(dates[dates.length - 1], frequency),
      });
    }
  }

  return found.sort((a, b) => b.amount - a.amount);
}

/** Drops detections already tracked, matching names the way duplicate detection does. */
export function newDetections(detected: DetectedSubscription[], knownNames: string[]): DetectedSubscription[] {
  const known = knownNames.map(normalizeName).filter(Boolean);
  return detected.filter((d) => {
    const n = normalizeName(d.name);
    return !known.some((k) => k === n || (Math.min(k.length, n.length) >= 5 && (k.includes(n) || n.includes(k))));
  });
}
