// Pure. Which pushes the user wants. Everything is on until switched off,
// so a kind added later starts on without anyone having to find it.

export const ALERT_SETTINGS = [
  { kind: "transaction", label: "Every new transaction", description: "A push for each charge or deposit as it syncs." },
  { kind: "large-charge", label: "Large charges", description: "Any single charge of $250 or more, even with the one above off." },
  { kind: "refund", label: "Refunds", description: "Money back from a store, with the purchase it's for. It counts in that purchase's month." },
  { kind: "deposit-review", label: "Deposits to review", description: "A Zelle transfer, check or other deposit that isn't a paycheck or interest, so you can say what it was." },
  { kind: "unusual-charge", label: "Unusual charges", description: "A charge far above what that merchant usually costs you." },
  { kind: "budget-over", label: "Over budget", description: "When a category goes over its monthly budget." },
  { kind: "budget-warning", label: "Budget nearly used", description: "When a category reaches 80% of its budget." },
  { kind: "renewal", label: "Upcoming renewals", description: "A subscription charging within 3 days." },
  { kind: "installment-due", label: "Installment payments", description: "A payment on an installment plan due within 3 days." },
  { kind: "subscription-review", label: "Subscriptions to review", description: "A new subscription's first charge, and any charge from one you cancelled." },
  { kind: "price-increase", label: "Price increases", description: "A subscription charging more than it used to." },
  { kind: "low-balance", label: "Low balance", description: "A checking or savings account under $100, at most weekly." },
  { kind: "high-utilization", label: "High card utilization", description: "A card using 30% or more of its limit, and again at 50%, once a month." },
  { kind: "bank-signin", label: "Bank needs signing in", description: "A connected bank stopped syncing until you sign in again." },
  { kind: "import-reminder", label: "Apple statement reminders", description: "Daily once an Apple Card or Apple Savings import is 2 weeks old, until you import again." },
  { kind: "monthly-summary", label: "Monthly summary", description: "On the 1st: what came in, what went out, net worth and budgets." },
] as const;

export type AlertSettingKind = (typeof ALERT_SETTINGS)[number]["kind"];
export type AlertSettings = Record<AlertSettingKind, boolean>;

export const ALERT_SETTING_KINDS = ALERT_SETTINGS.map((s) => s.kind) as AlertSettingKind[];

/** Stored settings (possibly partial or malformed) with every kind filled in. */
export function resolveAlertSettings(stored: unknown): AlertSettings {
  const raw = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(ALERT_SETTING_KINDS.map((k) => [k, raw[k] !== false])) as AlertSettings;
}
