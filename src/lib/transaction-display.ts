import { humanizeCategory } from "@/lib/plaid-categories";

// Pure, dependency-free display-layer transformation — never mutates or
// re-derives the stored `name`/`merchant_name`/`pfc_primary`/`pfc_detailed`
// fields, only computes what to show. Built from a live audit of all 485
// real transactions across Fifth Third, Chase, and American Express: see
// the "before -> after" samples in the PR/commit description for the real
// strings this was generalized from, not just the two examples in spec.

export type NameableTransaction = {
  name?: string | null;
  merchant_name?: string | null;
  amount: number; // Plaid convention: positive = money out, negative = money in
};

export type DisplayableTransaction = NameableTransaction & {
  pfc_primary: string | null;
  // A category the user chose by hand (or via a merchant rule). Wins over
  // both Plaid's pfc_primary and the heuristic override layer below — an
  // explicit decision is never second-guessed.
  category_override?: string | null;
};

// Beyond the PayPal/Venmo/Cash App/Zelle named in spec, the live data is
// full of Apple Cash P2P activity ("APPLE CASH SENT MONEY...", "APPLE CASH
// BANK XFER...") — same pattern class, so it's treated the same way.
const KNOWN_SERVICES: { pattern: RegExp; label: string }[] = [
  { pattern: /paypal/i, label: "PayPal" },
  { pattern: /venmo/i, label: "Venmo" },
  { pattern: /cash\s*app/i, label: "Cash App" },
  { pattern: /zelle/i, label: "Zelle" },
  { pattern: /apple\s*cash/i, label: "Apple Cash" },
];

// ACH/wire boilerplate tokens observed in the live data (and named in
// spec) — stripped wherever they appear, not just as a strict prefix, since
// real rows put them mid-string ("CHASE CREDIT CRD EPAY 260813", "ELAN WEB
// PYMT 260802"). Word-boundaried: an un-anchored /epay/i would also eat the
// "epay" inside "APPLEPAY" ("RCCL APPLEPAY" -> "Rccl Appl", a real bug
// caught by testing against the live data), so every token requires \b on
// both sides.
const BOILERPLATE_TOKENS = [
  /\bearly pay:/gi,
  /\bweb\s+pymt\b/gi,
  /\bepay\b/gi,
  /\bdes:/gi,
  /\bid:/gi,
];

// Common ACH/statement abbreviations expanded for readability once
// boilerplate is stripped — "CARDMEMBER SERV" -> "Cardmember Service",
// "CHASE CREDIT CRD" -> "Chase Credit Card".
const ABBREVIATIONS: Record<string, string> = {
  crd: "Card",
  pymt: "Payment",
  serv: "Service",
};

function stripBoilerplateTokens(s: string): string {
  let out = s;
  for (const re of BOILERPLATE_TOKENS) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

function expandAbbreviations(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => ABBREVIATIONS[w.toLowerCase()] ?? w)
    .join(" ");
}

// Strips trailing reference/confirmation numbers and date stamps, one token
// at a time from the end, e.g. "...CUPERTINO CA USA 7941" -> "...USA"
// (drops the 4-digit card-suffix "7941" but stops at "USA", which has no
// digit) or "...260817" -> "..." (drops the MMDDYY-shaped stamp). A token
// is stripped when it's all-digits (len >= 4, covers date stamps and
// card/branch suffixes like "7941" or phone-number-like "2067379149") or a
// mixed letters+digits reference code (len >= 6, covers "FBMPUSH9269V2BB",
// "0PE05B51GVNN", "SD1700").
function stripTrailingReferenceTokens(s: string): string {
  const words = s.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1];
    if (!/\d/.test(last)) break;
    const isAllDigits = /^\d+$/.test(last);
    const isMixedAlnum = /^[A-Za-z0-9]+$/.test(last) && /[A-Za-z]/.test(last);
    if (isAllDigits && last.length >= 4) {
      words.pop();
      continue;
    }
    if (isMixedAlnum && last.length >= 6) {
      words.pop();
      continue;
    }
    break;
  }
  return words.join(" ");
}

export function isMostlyUppercase(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length > 0.8;
}

// Capitalizes the first *letter* of each word, not just index 0 — a token
// like "*CHASE" has a leading "*", and w[0].toUpperCase() on that leaves it
// "*chase" instead of "*Chase".
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[a-z]/, (c) => c.toUpperCase()))
    .join(" ");
}

function detectService(raw: string): { label: string } | null {
  return KNOWN_SERVICES.find((s) => s.pattern.test(raw)) ?? null;
}

// "UNITED MORTGAGE PAYROLL 925644358895XMS 091526" -> captures "UNITED
// MORTGAGE" as the company, discarding PAYROLL and everything after it
// (reference numbers, date stamps) in one shot. Exported so
// spending-aggregation.ts's income-by-source split can reuse the same
// detection instead of re-parsing the raw name with its own regex.
export function detectPayrollCompany(raw: string): string | null {
  const match = raw.match(/^(.*?)\s+PAYROLL\b/i);
  const company = match?.[1]?.trim();
  return company ? company : null;
}

/**
 * Cleaned display name. Leaves merchant_name untouched whenever Plaid has
 * already populated it (the common case for retail/restaurant
 * transactions) — this cleanup exists specifically for the messy raw
 * `name` field Plaid leaves behind for bank transfers, ACH, and payroll
 * descriptors.
 */
export function humanizeTransactionName(tx: NameableTransaction): string {
  if (tx.merchant_name && tx.merchant_name.trim()) return tx.merchant_name;

  const raw = (tx.name ?? "").trim();
  if (!raw) return "Unknown";

  const service = detectService(raw);
  if (service) {
    const received = tx.amount < 0;
    return `${service.label} ${received ? "Transfer" : "Payment"}`;
  }

  const payrollCompany = detectPayrollCompany(raw);
  if (payrollCompany) {
    return `${toTitleCase(payrollCompany)} Paycheck`;
  }

  let cleaned = stripBoilerplateTokens(raw);
  cleaned = stripTrailingReferenceTokens(cleaned);
  if (!cleaned) return raw;

  if (isMostlyUppercase(cleaned)) cleaned = expandAbbreviations(toTitleCase(cleaned));
  return cleaned;
}

// A detected P2P transfer inherits whatever Plaid already assigned when
// that assignment is money-movement-appropriate (TRANSFER_IN/TRANSFER_OUT
// is obviously right; INCOME is right too — a contractor paid via Zelle is
// real income, not a generic transfer). Only overridden when Plaid landed
// somewhere that doesn't make sense for a P2P transfer, e.g. the real
// PayPal-transfer-tagged-LOAN_DISBURSEMENTS case found in the live audit.
const ALREADY_SENSIBLE_FOR_SERVICE = new Set(["TRANSFER_IN", "TRANSFER_OUT", "INCOME"]);

// A payment as the credit card sees it ("Payment Thank You-Mobile",
// "AUTOMATIC PAYMENT - THANK YOU"). Plaid files Chase's under
// LOAN_DISBURSEMENTS, as if the card had lent you money.
const CARD_PAYMENT_CREDIT = /\bpayment\b.*\bthank\s*you\b|^automatic payment - thank/i;
const ALREADY_SENSIBLE_FOR_CARD_PAYMENT = new Set(["LOAN_PAYMENTS", "TRANSFER_IN", "TRANSFER"]);

/** Money onto a card whose description says it's a payment. */
export function isCardPaymentByName(tx: NameableTransaction): boolean {
  return tx.amount < 0 && CARD_PAYMENT_CREDIT.test(`${tx.name ?? ""} ${tx.merchant_name ?? ""}`);
}

/**
 * Display-category override. Returns null when Plaid's own pfc_primary
 * should stand as-is — this is deliberately narrow (payroll, detected
 * P2P transfer patterns and card payments only), not a general
 * "second-guess Plaid" layer.
 */
export function overrideCategory(tx: DisplayableTransaction): string | null {
  if (isCardPaymentByName(tx)) {
    return tx.pfc_primary && ALREADY_SENSIBLE_FOR_CARD_PAYMENT.has(tx.pfc_primary) ? null : "LOAN_PAYMENTS";
  }

  const raw = (tx.name ?? "").trim();
  if (!raw) return null;

  if (detectPayrollCompany(raw)) {
    return tx.pfc_primary === "INCOME" ? null : "INCOME";
  }

  if (detectService(raw)) {
    if (tx.pfc_primary && ALREADY_SENSIBLE_FOR_SERVICE.has(tx.pfc_primary)) return null;
    return "TRANSFER";
  }

  return null;
}

/** Effective category after the override layer — null means "uncategorized", matching pfc_primary's own null semantics. */
export function effectiveCategory(tx: DisplayableTransaction): string | null {
  return tx.category_override ?? overrideCategory(tx) ?? tx.pfc_primary;
}

export function humanizeTransaction(tx: DisplayableTransaction): {
  displayName: string;
  displayCategory: string | null;
  displayCategoryLabel: string;
} {
  const displayCategory = effectiveCategory(tx);
  return {
    displayName: humanizeTransactionName(tx),
    displayCategory,
    displayCategoryLabel: humanizeCategory(displayCategory),
  };
}

/**
 * A name as it should read on screen. Banks send account and product names
 * in capitals ("FIFTH THIRD MOMENTUM CHECKING"); those become title case,
 * while a name already in mixed case is left exactly as it is.
 */
export function prettyName(name: string): string {
  return isMostlyUppercase(name) ? toTitleCase(name) : name;
}

/**
 * A recurring stream's display name. Plaid's stream description is the raw
 * bank descriptor ("UNITED MORTGAGE PAYROLL 925644358895XMS 091526"), so it
 * gets the same cleanup as a transaction name (payroll becomes "United
 * Mortgage Paycheck", reference numbers and boilerplate are dropped);
 * a merchant name Plaid already resolved is used as-is.
 */
export function streamDisplayName(
  stream: { merchant_name: string | null; description: string | null },
  direction: "inflow" | "outflow" = "outflow",
  fallback = "Unknown"
): string {
  const name = humanizeTransactionName({
    name: stream.description,
    merchant_name: stream.merchant_name,
    amount: direction === "inflow" ? -1 : 1,
  });
  return name === "Unknown" ? fallback : name;
}
