import { normalizeName } from "@/lib/subscription-insights";

// Pure. Plaid's own recurring detection only sees a charge on one account
// once it has several of them there, so it misses a subscription that moved
// from one card to another, one that was cancelled and started again, and
// anything on an imported card (Apple Card). This finds them in every
// charge, whichever account it landed on: a merchant charging about the
// same amount on a steady rhythm, taking only its latest unbroken run as
// the subscription it is now.

export type Charge = {
  date: string;
  name: string;
  amount: number;
  id?: string;
  accountId?: string | null;
  accountName?: string | null;
  // The app's category (Plaid's primary, or yours).
  category?: string | null;
};

export type Frequency = "WEEKLY" | "MONTHLY" | "ANNUALLY";

export type DetectedSubscription = {
  // Stable across page loads: the merchant, how often, and about what it costs.
  key: string;
  name: string;
  amount: number; // the latest price, or the typical one when it varies
  amountVaries: boolean;
  frequency: Frequency;
  occurrences: number; // charges in the current run
  firstDate: string; // the run's first charge
  lastDate: string;
  nextDate: string;
  // The account its latest charge was on.
  accountId: string | null;
  accountName: string | null;
  // Charged recently enough that it's still going.
  active: boolean;
  // Charged before, stopped, and started again on firstDate.
  restarted: boolean;
  // The price before the latest one, when it changed within the run.
  previousAmount: number | null;
  // The run's charges, newest first.
  charges: { id: string | null; date: string; amount: number; accountName: string | null }[];
};

const DAY_MS = 86_400_000;
const toDay = (iso: string) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
const toIso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const days = (a: string, b: string) => toDay(b) - toDay(a);
const cents = (x: number) => Math.round(x * 100);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The cadence a list of charge dates follows, or null. Most gaps must fit, so one skipped month doesn't sink it. */
export function cadenceOf(dates: string[]): Frequency | null {
  const sorted = Array.from(new Set(dates)).sort();
  if (sorted.length < 2) return null;
  const gaps = sorted.slice(1).map((d, i) => days(sorted[i], d));
  const share = (lo: number, hi: number) => gaps.filter((g) => g >= lo && g <= hi).length / gaps.length;

  if (sorted.length >= 4 && share(6, 8) >= 0.7) return "WEEKLY";
  if (sorted.length >= 3 && share(26, 35) >= 0.7) return "MONTHLY";
  if (sorted.length >= 2 && share(350, 380) >= 1) return "ANNUALLY";
  return null;
}

// The gap from one charge to the next, and how long after the last one it
// still counts as going (a charge can post a few days late, and a statement
// may not be imported yet).
const CADENCE: Record<Frequency, { lo: number; hi: number; skip?: [number, number]; grace: number }> = {
  WEEKLY: { lo: 6, hi: 8, grace: 12 },
  // One missed month inside a run (a statement not imported) doesn't break it.
  MONTHLY: { lo: 26, hi: 35, skip: [55, 66], grace: 45 },
  ANNUALLY: { lo: 350, hi: 380, grace: 400 },
};

// Services people subscribe to, so two charges a month apart are enough to
// go on (a subscription restarted two months ago).
const KNOWN =
  /\bprime\b|netflix|spotify|hulu|disney|\bmax\b|hbo|youtube|apple\s*(services|one|music|tv|arcade)|icloud|apple\.com\/bill|paramount|peacock|audible|kindle|sirius|pandora|tidal|crunchyroll|espn|fubo|sling|chatgpt|openai|anthropic|claude|midjourney|adobe|microsoft 365|office 365|xbox|playstation|nintendo|\bsteam\b|uber one|dashpass|doordash|grubhub|instacart|walmart\+|walmart plus|patreon|onlyfans|twitch|substack|nytimes|new york times|wsj|washington post|gym|fitness|planet fitness|la fitness|crunch|equinox|peloton|strava|duolingo|headspace|\bcalm\b|nordvpn|expressvpn|surfshark|dropbox|google (one|storage|workspace)|github|notion|canva|grammarly|linkedin|hinge|tinder|bumble|zoom|slack|squarespace|wix|godaddy|shopify|hellofresh|\bfactor\b|blue apron|verizon|t-mobile|at&t|xfinity|comcast|spectrum|geico|progressive|state farm|allstate|lemonade|membership|subscription/i;

/** A name that's a known subscription service (Netflix, Amazon Prime, a gym). */
export function isKnownService(name: string): boolean {
  return KNOWN.test(name);
}

// A price that moves each time (a utility, a phone bill) only counts in
// categories where bills live; groceries and gas also come about weekly.
const BILL_CATEGORIES = new Set(["RENT_AND_UTILITIES", "GENERAL_SERVICES", "LOAN_PAYMENTS", "BANK_FEES", "MEDICAL", "PERSONAL_CARE", "ENTERTAINMENT"]);
// Everyday spending with a merchant can look regular without being a plan.
const EVERYDAY = new Set(["FOOD_AND_DRINK", "TRANSPORTATION", "TRAVEL"]);
const NEVER = /^(INCOME|TRANSFER_IN|TRANSFER_OUT|TRANSFER)$/;

const fits = (gap: number, f: Frequency) => {
  const c = CADENCE[f];
  return (gap >= c.lo && gap <= c.hi) || (c.skip !== undefined && gap >= c.skip[0] && gap <= c.skip[1]);
};

/** The next charge after `lastDate`: for a monthly one, on its usual day of the month. */
function nextAfter(lastDate: string, frequency: Frequency, usualDay: number): string {
  if (frequency === "WEEKLY") return toIso(toDay(lastDate) + 7);
  const y = Number(lastDate.slice(0, 4));
  const m = Number(lastDate.slice(5, 7)) - 1;
  if (frequency === "ANNUALLY") return `${y + 1}${lastDate.slice(4)}`;
  const ny = m === 11 ? y + 1 : y;
  const nm = (m + 1) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(usualDay, last)).padStart(2, "0")}`;
}

/** Charges refunded in full soon after (a trial charge taken back) never happened. */
function withoutRefunded(group: Charge[]): Charge[] {
  const refunds = group.filter((c) => c.amount < 0);
  const charges = group.filter((c) => c.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const gone = new Set<Charge>();
  for (const r of refunds) {
    const hit = charges.find((c) => !gone.has(c) && cents(c.amount) === cents(-r.amount) && days(c.date, r.date) >= 0 && days(c.date, r.date) <= 45);
    if (hit) gone.add(hit);
  }
  return charges.filter((c) => !gone.has(c));
}

/**
 * The latest unbroken run in `pool` at this cadence, newest first: from the
 * newest charge back, each step one period earlier, at about the same price
 * (within 35%, so a price increase doesn't break it; any price for a bill).
 */
function latestRun(pool: Charge[], frequency: Frequency, anyPrice: boolean): Charge[] {
  const byDate = [...pool].sort((a, b) => b.date.localeCompare(a.date));
  const run = [byDate[0]];
  for (;;) {
    const cur = run[run.length - 1];
    const candidates = byDate.filter(
      (c) => !run.includes(c) && c.date < cur.date && fits(days(c.date, cur.date), frequency) && (anyPrice || Math.abs(c.amount - cur.amount) <= cur.amount * 0.35)
    );
    if (candidates.length === 0) return run;
    // One period back before one skipped, then the nearest in price, then the nearest a period back.
    const skipped = (c: Charge) => Number(days(c.date, cur.date) > CADENCE[frequency].hi);
    candidates.sort(
      (a, b) =>
        skipped(a) - skipped(b) ||
        Math.abs(a.amount - cur.amount) - Math.abs(b.amount - cur.amount) ||
        Math.abs(days(a.date, cur.date) - CADENCE[frequency].lo) - Math.abs(days(b.date, cur.date) - CADENCE[frequency].lo)
    );
    run.push(candidates[0]);
  }
}

/**
 * Charges (purchases only) that repeat on a steady rhythm, across every
 * account. For each merchant, runs are taken newest first until none is
 * left: two subscriptions on one descriptor at different prices are two
 * runs. A run qualifies when it's long enough to be sure (three monthly
 * charges, five weekly, two yearly) or, for a known subscription service,
 * two. A run whose price moves every time only counts for a bill.
 */
export function detectRecurring(charges: Charge[], todayIso: string = new Date().toISOString().slice(0, 10)): DetectedSubscription[] {
  const byMerchant = new Map<string, Charge[]>();
  for (const c of charges) {
    if (NEVER.test(c.category ?? "")) continue;
    const key = normalizeName(c.name);
    if (!key) continue;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), c]);
  }

  const found: DetectedSubscription[] = [];

  for (const [merchantKey, group] of byMerchant) {
    const name = [...group].sort((a, b) => b.date.localeCompare(a.date))[0].name;
    const known = KNOWN.test(name);
    const categories = new Set(group.map((c) => c.category ?? ""));
    const everyday = [...categories].some((c) => EVERYDAY.has(c));
    if (everyday && !known) continue;
    const bill = [...categories].some((c) => BILL_CATEGORIES.has(c));

    let pool = withoutRefunded(group);
    while (pool.length >= 2) {
      let best: { run: Charge[]; frequency: Frequency } | null = null;
      for (const frequency of ["MONTHLY", "WEEKLY", "ANNUALLY"] as const) {
        const run = latestRun(pool, frequency, bill);
        if (!best || run.length > best.run.length) best = { run, frequency };
      }
      const { run, frequency } = best!;
      pool = pool.filter((c) => !run.includes(c));
      if (run.length < 2) {
        // The newest charge started nothing; look at what's left.
        continue;
      }

      const need = frequency === "WEEKLY" ? (known ? 4 : 5) : frequency === "MONTHLY" ? (known ? 2 : 3) : known || bill ? 2 : 3;
      if (run.length < need) continue;

      // Mostly one price (allowing a price change), or a bill whose price moves.
      const latest = run[0];
      const samePrice = run.filter((c) => Math.abs(cents(c.amount) - cents(latest.amount)) <= 1).length;
      const prices = new Set(run.map((c) => cents(c.amount)));
      // Two charges are only a subscription at one price.
      const steady = run.length === 2 ? prices.size === 1 : samePrice / run.length >= 0.6 || prices.size <= 2;
      if (!steady && !bill) continue;

      const oldest = run[run.length - 1];
      const earlier = group.some((c) => c.amount > 0 && c.date < oldest.date && days(c.date, oldest.date) > CADENCE[frequency].hi * 1.5);
      const changed = run.find((c) => Math.abs(cents(c.amount) - cents(latest.amount)) > 1);
      const usualDay = Math.round(median(run.map((c) => Number(c.date.slice(8, 10)))));
      const amount = steady ? latest.amount : Math.round(median(run.map((c) => c.amount)) * 100) / 100;

      found.push({
        key: `${merchantKey}|${frequency}|${Math.round(amount)}`,
        name,
        amount,
        amountVaries: !steady,
        frequency,
        occurrences: run.length,
        firstDate: oldest.date,
        lastDate: latest.date,
        nextDate: nextAfter(latest.date, frequency, usualDay),
        accountId: latest.accountId ?? null,
        accountName: latest.accountName ?? null,
        active: days(latest.date, todayIso) <= CADENCE[frequency].grace,
        restarted: earlier,
        previousAmount: steady && changed ? changed.amount : null,
        charges: run.map((c) => ({ id: c.id ?? null, date: c.date, amount: c.amount, accountName: c.accountName ?? null })),
      });
    }
  }

  return found.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

/** Whether two names are the same service, the way duplicate detection matches them. */
export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
}

/** Drops detections already tracked, matching names the way duplicate detection does. */
export function newDetections(detected: DetectedSubscription[], knownNames: string[]): DetectedSubscription[] {
  return detected.filter((d) => !knownNames.some((k) => sameName(k, d.name)));
}
