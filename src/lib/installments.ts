import { z } from "zod";

// Pure. Installment plans: a purchase paid off in fixed monthly charges
// (Apple Card Monthly Installments), found among the card's charges or
// added by hand, and how far along each one is.
//
// A plan charges the same amount on the same day of each month until it's
// paid, so once its first charge is known the whole schedule is: payments
// dated up to today have been made, whether or not the statement with them
// has been imported yet.

export const INSTALLMENT_ICONS = ["laptop", "phone", "tablet", "watch", "headphones", "other"] as const;
export type InstallmentIcon = (typeof INSTALLMENT_ICONS)[number];

export const ICON_LABELS: Record<InstallmentIcon, string> = {
  laptop: "MacBook",
  phone: "iPhone",
  tablet: "iPad",
  watch: "Watch",
  headphones: "AirPods",
  other: "Other",
};

// A name to suggest for each, as a placeholder and in the reminder to fill it in.
export const EXAMPLE_NAMES: Record<InstallmentIcon, string> = {
  laptop: "MacBook Air",
  phone: "iPhone 17 Pro",
  tablet: "iPad Air",
  watch: "Apple Watch",
  headphones: "AirPods Pro",
  other: "Couch",
};

// Apple Card Monthly Installments: 24 payments for an iPhone, 12 for the rest.
export const DEFAULT_PAYMENTS_FOR: Record<InstallmentIcon, number> = { laptop: 12, phone: 24, tablet: 12, watch: 12, headphones: 12, other: 12 };

const money = z.number().positive().max(1_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// What you've set on a plan found in your charges.
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  icon: z.enum(INSTALLMENT_ICONS).optional(),
  payments: z.number().int().min(1).max(60).optional(),
  // What it cost in all, when it isn't just the monthly amount times the payments.
  price: money.nullable().optional(),
  // Not an installment after all.
  hidden: z.boolean().optional(),
});
export type PlanSettings = z.infer<typeof settingsSchema>;

// A plan you added yourself (Affirm, a phone on a carrier plan).
const addedSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  icon: z.enum(INSTALLMENT_ICONS),
  monthly: money,
  payments: z.number().int().min(1).max(60),
  // The day of the first payment.
  start: isoDate,
  price: money.nullable(),
});
export type AddedPlan = z.infer<typeof addedSchema>;

const prefsSchema = z.object({
  detected: z.record(z.string(), settingsSchema).catch({}),
  added: z.array(addedSchema).catch([]),
});
export type InstallmentPrefs = z.infer<typeof prefsSchema>;

export const planSettingsSchema = settingsSchema;
export const addedPlanSchema = addedSchema;

export function resolveInstallmentPrefs(raw: unknown): InstallmentPrefs {
  const parsed = prefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { detected: {}, added: [] };
}

export type InstallmentCharge = {
  id: string;
  date: string;
  amount: number;
  name: string;
  // The import's note ("Apple Card Monthly Installment") or yours.
  note: string | null;
  accountId: string | null;
  accountName: string | null;
};

const INSTALLMENT = /installment/i;
// Apple's own store, where Apple Card Monthly Installments are bought.
const APPLE_STORE = /\bapple\b.*\b(store|online|\.com\/us)\b|\bapple store\b/i;

/** "3 of 12" or "3/12" in a charge's description or note: this payment, of how many. */
export function paymentNumber(text: string): { n: number; of: number } | null {
  const m = text.match(/\b(\d{1,2})\s*(?:of|\/)\s*(\d{1,2})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const of = Number(m[2]);
  return n >= 1 && of >= 2 && n <= of ? { n, of } : null;
}

const cents = (x: number) => Math.round(x * 100);

/** The same day `months` later; the 31st in a 30-day month is the 30th. */
export function addMonths(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + months;
  const d = Number(iso.slice(8, 10));
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export type DetectedPlan = {
  key: string;
  accountId: string | null;
  accountName: string | null;
  merchant: string;
  monthly: number;
  // Oldest first.
  charges: InstallmentCharge[];
  // From "3 of 12" on a charge: the plan's length and when it started.
  of: number | null;
  start: string;
};

/**
 * Plans hiding in the charges: anything noted or named as an installment
 * (the Apple Card import notes each one), plus an Apple Store charge of the
 * same amount in two or more months running on one card, which is how an
 * installment looks when the export doesn't say so. Charges within a few
 * cents of each other on one account are one plan (the last payment can
 * be off by a cent or two).
 */
export function detectInstallments(charges: InstallmentCharge[]): DetectedPlan[] {
  const charged = charges.filter((c) => c.amount > 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const marked = charged.filter((c) => INSTALLMENT.test(`${c.name} ${c.note ?? ""}`));

  // Unmarked Apple Store charges that repeat to the cent month after month.
  const byAmount = new Map<string, InstallmentCharge[]>();
  for (const c of charged) {
    if (marked.includes(c) || !c.accountId || !APPLE_STORE.test(c.name)) continue;
    const k = `${c.accountId}|${cents(c.amount)}`;
    byAmount.set(k, [...(byAmount.get(k) ?? []), c]);
  }
  const repeating = [...byAmount.values()].flatMap((list) => {
    const months = new Set(list.map((c) => c.date.slice(0, 7)));
    const sorted = [...months].sort();
    const consecutive = sorted.some((m, i) => i > 0 && addMonths(`${sorted[i - 1]}-01`, 1).slice(0, 7) === m);
    return months.size >= 2 && months.size === list.length && consecutive ? list : [];
  });

  const groups: InstallmentCharge[][] = [];
  for (const c of [...marked, ...repeating].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const group = groups.find((g) => g[0].accountId === c.accountId && Math.abs(cents(g[0].amount) - cents(c.amount)) <= 5);
    if (group) group.push(c);
    else groups.push([c]);
  }

  return groups.map((list) => {
    // The usual amount, not the odd last one.
    const counts = new Map<number, number>();
    for (const c of list) counts.set(cents(c.amount), (counts.get(cents(c.amount)) ?? 0) + 1);
    const usual = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const numbered = list
      .map((c) => ({ c, p: paymentNumber(`${c.name} ${c.note ?? ""}`) }))
      .filter((x): x is { c: InstallmentCharge; p: { n: number; of: number } } => x.p !== null);
    const latest = numbered.at(-1);
    return {
      key: `${list[0].accountId ?? "none"}|${usual}`,
      accountId: list[0].accountId,
      accountName: list[0].accountName,
      merchant: list[0].name,
      monthly: usual / 100,
      charges: list,
      of: latest ? latest.p.of : null,
      start: latest ? addMonths(latest.c.date, -(latest.p.n - 1)) : list[0].date,
    };
  });
}

export type ScheduledPayment = {
  n: number;
  date: string;
  amount: number;
  // The charge it matched, when one's been imported.
  charge: InstallmentCharge | null;
  status: "paid" | "due";
};

export type InstallmentPlan = {
  key: string;
  source: "detected" | "added";
  name: string;
  // Set by you, rather than the default.
  named: boolean;
  icon: InstallmentIcon;
  monthly: number;
  payments: number;
  price: number;
  accountName: string | null;
  schedule: ScheduledPayment[];
  paid: number;
  paidAmount: number;
  left: number;
  leftAmount: number;
  // 0 to 1.
  progress: number;
  next: ScheduledPayment | null;
  // The day of the last payment.
  payoff: string;
  done: boolean;
  hidden: boolean;
};

// Apple Card Monthly Installments run 12 months for a Mac, iPad or Watch
// and 24 for an iPhone; 12 is the default until you say otherwise.
const DEFAULT_PAYMENTS = 12;

function build(input: {
  key: string;
  source: "detected" | "added";
  name: string;
  named: boolean;
  icon: InstallmentIcon;
  monthly: number;
  payments: number;
  price: number | null;
  start: string;
  accountName: string | null;
  charges: InstallmentCharge[];
  hidden: boolean;
  todayIso: string;
}): InstallmentPlan {
  const { monthly, payments, todayIso } = input;
  const price = input.price ?? Math.round(monthly * payments * 100) / 100;
  const unmatched = [...input.charges];
  const schedule: ScheduledPayment[] = Array.from({ length: payments }, (_, i) => {
    const date = addMonths(input.start, i);
    // The charge closest to this payment's day, within about two weeks.
    const near = unmatched
      .map((c, idx) => ({ idx, gap: Math.abs(Date.parse(c.date) - Date.parse(date)) / 86_400_000 }))
      .filter((x) => x.gap <= 16)
      .sort((a, b) => a.gap - b.gap)[0];
    const charge = near ? unmatched.splice(near.idx, 1)[0] : null;
    // The last payment settles what's left of the price.
    const amount = i === payments - 1 ? Math.round((price - monthly * (payments - 1)) * 100) / 100 : monthly;
    return {
      n: i + 1,
      date: charge?.date ?? date,
      amount: charge ? charge.amount : amount,
      charge,
      status: charge || date <= todayIso ? ("paid" as const) : ("due" as const),
    };
  });
  const made = schedule.filter((p) => p.status === "paid");
  const paidAmount = Math.round(made.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const leftAmount = Math.max(0, Math.round((price - paidAmount) * 100) / 100);
  return {
    key: input.key,
    source: input.source,
    name: input.name,
    named: input.named,
    icon: input.icon,
    monthly,
    payments,
    price,
    accountName: input.accountName,
    schedule,
    paid: made.length,
    paidAmount,
    left: payments - made.length,
    leftAmount,
    progress: payments > 0 ? made.length / payments : 1,
    next: schedule.find((p) => p.status === "due") ?? null,
    payoff: schedule[schedule.length - 1]?.date ?? input.start,
    done: made.length === payments,
    hidden: input.hidden,
  };
}

/** Every plan, found or added, with its schedule as of today. Unfinished first, then by payoff. */
export function buildInstallmentPlans(charges: InstallmentCharge[], prefs: InstallmentPrefs, todayIso: string): InstallmentPlan[] {
  const detected = detectInstallments(charges).map((d) => {
    const set = prefs.detected[d.key] ?? {};
    const payments = Math.max(set.payments ?? d.of ?? DEFAULT_PAYMENTS, d.charges.length);
    return build({
      key: d.key,
      source: "detected",
      name: set.name ?? (d.accountName ? `${d.accountName} installment` : `${d.merchant} installment`),
      named: Boolean(set.name),
      icon: set.icon ?? "other",
      monthly: d.monthly,
      payments,
      price: set.price ?? null,
      start: d.start,
      accountName: d.accountName,
      charges: d.charges,
      hidden: Boolean(set.hidden),
      todayIso,
    });
  });

  // An added plan claims charges of its amount near each of its payment days.
  const claimed = installmentChargeIds(detected);
  const added = prefs.added.map((a) =>
    build({
      key: a.id,
      source: "added",
      name: a.name,
      named: true,
      icon: a.icon,
      monthly: a.monthly,
      payments: a.payments,
      price: a.price,
      start: a.start,
      accountName: null,
      charges: charges.filter((c) => !claimed.has(c.id) && c.amount > 0 && Math.abs(cents(c.amount) - cents(a.monthly)) <= 5),
      hidden: false,
      todayIso,
    })
  );

  return [...detected, ...added].sort((a, b) => Number(a.done) - Number(b.done) || a.payoff.localeCompare(b.payoff) || a.name.localeCompare(b.name));
}

/** The charges that belong to installment plans, so they aren't also suggested as subscriptions. */
export function installmentChargeIds(plans: InstallmentPlan[]): Set<string> {
  return new Set(plans.flatMap((p) => p.schedule.flatMap((s) => (s.charge ? [s.charge.id] : []))));
}
