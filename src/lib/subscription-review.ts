import { z } from "zod";
import { isKnownService, sameName } from "@/lib/recurring-detection";

// Pure. How the three places a subscription can come from fit together, so
// each service is one entry, counted once, with one answer to "is it still
// going?":
//
//   - the bank's recurring feed (Plaid), which updates itself from charges;
//   - found in your charges (recurring-detection.ts), for what the bank
//     misses;
//   - added by you (including one tracked from its first charge).
//
// When two of them are the same service, the one with more evidence stands
// for it (bank, then found, then yours) and the other is covered: kept, but
// not listed or counted. A cancelled entry stays cancelled, and any charge
// from it after the day you cancelled is flagged, even one. A first charge
// from a subscription service nothing tracks is asked about the day it
// appears, pending or not.

export type Source = "plaid" | "found" | "manual";

export type EntryInput = {
  key: string; // "plaid-<id>" | "found-<key>" | "manual-<id>"
  source: Source;
  name: string;
  amount: number;
  // Counts toward the totals as stored (not cancelled, still charging).
  active: boolean;
  // You said it's cancelled; `cancelledOn` is the day, when you gave one.
  cancelled: boolean;
  cancelledOn: string | null;
  // For a found one: the first charge of its current run, and whether you've confirmed it.
  firstDate?: string | null;
  confirmed?: boolean;
};

export type ReviewCharge = {
  id: string;
  date: string;
  name: string;
  amount: number;
  pending: boolean;
  accountId: string | null;
  accountName: string | null;
  category: string | null;
};

// ---- What you've answered ---------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const answered = z.object({ key: z.string().max(200), date: isoDate, amount: z.number() });
const schema = z.object({
  // The day each one was cancelled, by entry key.
  cancellations: z.record(z.string().max(200), isoDate).catch({}),
  // Charges after a cancel you said were expected (a last bill, one refunded).
  acknowledged: z.array(answered).max(500).catch([]),
  // First charges you said aren't a subscription (key: the merchant's name).
  dismissedNew: z.array(answered).max(500).catch([]),
  // Found ones you said look right.
  confirmed: z.array(z.string().max(200)).max(500).catch([]),
});
export type SubscriptionReviewPrefs = z.infer<typeof schema>;

export function resolveSubscriptionReview(raw: unknown): SubscriptionReviewPrefs {
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { cancellations: {}, acknowledged: [], dismissedNew: [], confirmed: [] };
}

export type ReviewAction =
  | { action: "cancel"; key: string; on: string }
  | { action: "uncancel"; key: string }
  | { action: "acknowledge"; key: string; date: string; amount: number }
  | { action: "dismiss-new"; name: string; date: string; amount: number }
  | { action: "confirm"; key: string };

const cap = <T>(xs: T[]) => xs.slice(-400);

export function applyReviewAction(prefs: SubscriptionReviewPrefs, a: ReviewAction): SubscriptionReviewPrefs {
  const next = { ...prefs, cancellations: { ...prefs.cancellations } };
  switch (a.action) {
    case "cancel":
      next.cancellations[a.key] = a.on;
      break;
    case "uncancel":
      delete next.cancellations[a.key];
      // Charges after it are no longer "after a cancel".
      next.acknowledged = prefs.acknowledged.filter((x) => x.key !== a.key);
      break;
    case "acknowledge":
      next.acknowledged = cap([...prefs.acknowledged, { key: a.key, date: a.date, amount: a.amount }]);
      break;
    case "dismiss-new":
      next.dismissedNew = cap([...prefs.dismissedNew, { key: a.name, date: a.date, amount: a.amount }]);
      break;
    case "confirm":
      next.confirmed = cap([...prefs.confirmed.filter((k) => k !== a.key), a.key]);
      break;
  }
  return next;
}

// ---- Reconciling ------------------------------------------------------

const RANK: Record<Source, number> = { plaid: 0, found: 1, manual: 2 };
const DAY_MS = 86_400_000;
const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
const cents = (x: number) => Math.round(x * 100);

/** A charge that's this subscription: its name, and about its price (within 35%, or $2 for a cheap one). */
export function chargeMatches(charge: { name: string; amount: number }, entry: { name: string; amount: number }): boolean {
  if (!(charge.amount > 0) || !sameName(charge.name, entry.name)) return false;
  return Math.abs(charge.amount - entry.amount) <= Math.max(entry.amount * 0.35, 2);
}

// A first charge is asked about for a month; after that, the detection has had its chance.
const NEW_WINDOW_DAYS = 35;
// A charge with an earlier one like it this recently isn't a first.
const NEW_QUIET_DAYS = 60;
// A found one is confirmable while its run is this new.
const FOUND_REVIEW_DAYS = 60;
// A pending charge that posts can move a few days; one answer covers both.
const SAME_CHARGE_DAYS = 6;

export type NewSubscription = { charge: ReviewCharge; name: string; renewsOn: string };
export type ChargedAfterCancel = { key: string; name: string; cancelledOn: string; charge: ReviewCharge };

export type Reconciled = {
  // Covered entries, and what covers each.
  covered: Map<string, string>;
  // Keys of manual entries each listed entry stands for.
  covers: Map<string, string[]>;
  afterCancel: ChargedAfterCancel[];
  newSubscriptions: NewSubscription[];
  // Found ones recently started that you haven't confirmed.
  toConfirm: string[];
};

/** The same day a month later (the 31st in a 30-day month is the 30th). */
export function monthAfter(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function reconcileSubscriptions(entries: EntryInput[], charges: ReviewCharge[], prefs: SubscriptionReviewPrefs, todayIso: string): Reconciled {
  // Standing entries: going, or cancelled by you. One that stopped on its
  // own (the bank's copy of one that moved cards) stands for nothing.
  const standing = (e: EntryInput) => e.active || e.cancelled;
  const covered = new Map<string, string>();
  for (const e of entries) {
    const better = entries
      .filter((o) => o.key !== e.key && sameName(o.name, e.name) && standing(o))
      .filter((o) => (standing(e) ? RANK[o.source] < RANK[e.source] : true))
      .sort((a, b) => Number(b.active) - Number(a.active) || RANK[a.source] - RANK[b.source])[0];
    if (better) covered.set(e.key, better.key);
  }
  // Follow chains (manual → found → bank) to the entry that's listed.
  const top = (key: string): string => {
    const seen = new Set<string>();
    let k = key;
    while (covered.has(k) && !seen.has(k)) {
      seen.add(k);
      k = covered.get(k)!;
    }
    return k;
  };
  for (const [k] of covered) covered.set(k, top(k));
  const covers = new Map<string, string[]>();
  for (const [k, by] of covered) {
    if (entries.find((e) => e.key === k)?.source === "manual") covers.set(by, [...(covers.get(by) ?? []), k]);
  }

  // Charges after a cancel: any charge of it dated after the day you
  // cancelled, unless you said it was expected. Checked even when another
  // entry now stands for it: one you cancelled that's charging again is
  // exactly what should be flagged.
  const afterCancel: ChargedAfterCancel[] = [];
  const flagged = new Set<string>();
  for (const e of entries) {
    if (!e.cancelled || !e.cancelledOn) continue;
    for (const c of charges) {
      if (flagged.has(c.id) || c.date <= e.cancelledOn || !chargeMatches(c, e)) continue;
      const known = prefs.acknowledged.some((a) => a.key === e.key && cents(a.amount) === cents(c.amount) && dayGap(a.date, c.date) <= SAME_CHARGE_DAYS);
      if (known) continue;
      flagged.add(c.id);
      afterCancel.push({ key: e.key, name: e.name, cancelledOn: e.cancelledOn, charge: c });
    }
  }

  // First charges from a subscription service nothing tracks (a stopped
  // one's restart counts as new).
  const recent = charges
    .filter((c) => c.amount > 0 && dayGap(c.date, todayIso) <= NEW_WINDOW_DAYS && c.date <= todayIso && !flagged.has(c.id))
    .filter((c) => !/^(INCOME|TRANSFER)/.test(c.category ?? "") && isKnownService(c.name))
    .sort((a, b) => b.date.localeCompare(a.date));
  const newSubscriptions: NewSubscription[] = [];
  // Only each merchant's latest charge is a candidate.
  const seen: string[] = [];
  for (const c of recent) {
    if (seen.some((n) => sameName(n, c.name))) continue;
    seen.push(c.name);
    if (entries.some((e) => standing(e) && sameName(e.name, c.name))) continue;
    const before = charges.some(
      (o) => o.id !== c.id && o.date < c.date && dayGap(o.date, c.date) > SAME_CHARGE_DAYS && dayGap(o.date, c.date) <= NEW_QUIET_DAYS && chargeMatches(o, c)
    );
    if (before) continue;
    const dismissed = prefs.dismissedNew.some((d) => sameName(d.key, c.name) && cents(d.amount) === cents(c.amount) && dayGap(d.date, c.date) <= SAME_CHARGE_DAYS);
    if (dismissed) continue;
    newSubscriptions.push({ charge: c, name: c.name, renewsOn: monthAfter(c.date) });
  }

  const toConfirm = entries
    .filter((e) => e.source === "found" && e.active && !covered.has(e.key) && !e.confirmed && e.firstDate && dayGap(e.firstDate, todayIso) <= FOUND_REVIEW_DAYS)
    .map((e) => e.key);

  return { covered, covers, afterCancel, newSubscriptions, toConfirm };
}
