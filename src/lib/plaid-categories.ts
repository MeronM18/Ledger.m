// Plaid's Personal Finance Category (PFC) taxonomy has ~18 fixed `primary`
// values (https://plaid.com/documents/pfc-taxonomy-all.csv). These represent
// money movement, not spending, and are excluded from "spending" views:
// INCOME/LOAN_DISBURSEMENTS (money coming in), TRANSFER_IN/TRANSFER_OUT
// (moving money between your own accounts), and LOAN_PAYMENTS (debt
// principal/interest — a real obligation, but not discretionary/necessary
// consumption spending, and lumping it in would dwarf every other category).
// TRANSFER isn't a real Plaid value — it's the synthetic category
// transaction-display.ts's overrideCategory() produces for a detected P2P
// transfer that Plaid mis-tagged (e.g. a PayPal transfer landing in
// LOAN_DISBURSEMENTS), so it needs the same exclusion.
const NON_SPENDING_PFC_PRIMARY = new Set([
  "INCOME",
  "LOAN_DISBURSEMENTS",
  "LOAN_PAYMENTS",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "TRANSFER",
]);

// Every PFC primary category actually seen across all three connected
// institutions (confirmed against live data) — used as the fixed dropdown
// for manually-entered transactions/subscriptions rather than free text, so
// a manual entry aggregates into the exact same category buckets as a
// Plaid-sourced one instead of creating an ungrouped one-off category.
export const ALL_PFC_CATEGORIES = [
  "BANK_FEES",
  "ENTERTAINMENT",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "GENERAL_SERVICES",
  "GOVERNMENT_AND_NON_PROFIT",
  "HOME_IMPROVEMENT",
  "INCOME",
  "LOAN_DISBURSEMENTS",
  "LOAN_PAYMENTS",
  "MEDICAL",
  "OTHER",
  "PERSONAL_CARE",
  "RENT_AND_UTILITIES",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "TRANSPORTATION",
  "TRAVEL",
] as const;

export function isSpendingCategory(pfcPrimary: string | null): boolean {
  if (!pfcPrimary) return true; // uncategorized transactions still count as spending
  return !NON_SPENDING_PFC_PRIMARY.has(pfcPrimary);
}

export function humanizeCategory(pfcPrimary: string | null): string {
  if (!pfcPrimary) return "Uncategorized";
  return pfcPrimary
    .toLowerCase()
    .split("_")
    .map((word) => (word === "and" ? "&" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

// Fixed category -> color-slot assignment (1-8), so a given category always
// gets the same color regardless of which categories happen to be present in
// a given month/filter (see dataviz skill: "color follows the entity, never
// its rank"). The 8 slots are this app's real-world spending categories,
// pre-filled first; any category beyond the 8th slot folds into "Other" for
// coloring/aggregation purposes rather than generating a 9th hue.
const CATEGORY_COLOR_SLOT: Record<string, number> = {
  FOOD_AND_DRINK: 1,
  GENERAL_MERCHANDISE: 2,
  TRANSPORTATION: 3,
  ENTERTAINMENT: 4,
  PERSONAL_CARE: 5,
  GENERAL_SERVICES: 6,
  BANK_FEES: 7,
  OTHER: 8,
};
const MAX_CATEGORY_COLOR_SLOTS = 8;

/**
 * Returns a 1-8 slot for CSS var --viz-N (see globals.css), or null if this
 * category should fold into the "Other" bucket (unassigned or 9th+ distinct
 * category actually present).
 */
export function categoryColorSlot(pfcPrimary: string | null): number | null {
  const key = pfcPrimary ?? "OTHER";
  return CATEGORY_COLOR_SLOT[key] ?? null;
}

export const OTHER_CATEGORY_COLOR_SLOT = MAX_CATEGORY_COLOR_SLOTS;

/**
 * Multiplier to normalize a recurring stream's per-period amount to a
 * monthly figure. UNKNOWN has no defined cadence — treated as already
 * monthly (best-effort) rather than excluded, so it still contributes to the
 * total instead of silently vanishing.
 */
export function monthlyFactorForFrequency(frequency: string | null): number {
  switch (frequency) {
    case "WEEKLY":
      return 52 / 12;
    case "BIWEEKLY":
      return 26 / 12;
    case "SEMI_MONTHLY":
      return 2;
    case "MONTHLY":
      return 1;
    case "ANNUALLY":
      return 1 / 12;
    default:
      return 1;
  }
}

export function humanizeFrequency(frequency: string | null): string {
  switch (frequency) {
    case "WEEKLY":
      return "Weekly";
    case "BIWEEKLY":
      return "Biweekly";
    case "SEMI_MONTHLY":
      return "Semi-monthly";
    case "MONTHLY":
      return "Monthly";
    case "ANNUALLY":
      return "Annually";
    default:
      return "Unknown";
  }
}
