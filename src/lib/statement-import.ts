// Pure, dependency-free. Reads a bank statement PDF's text (as positioned
// text items, from lib/pdf-text.ts) into transactions, and checks them
// against the statement's own totals before anything is trusted.
//
// Supported: Comerica checking statements (the account that became Fifth
// Third). The layout is one table per kind of activity ("Electronic
// deposits this statement period", ...), each row a date, a signed amount,
// a description and a bank reference number, and each table closed by its
// total and count. Those totals, and the beginning and ending balances, are
// what make a parse checkable: if the rows don't add up to them, the
// statement is rejected rather than half-imported.

export type TextItem = { str: string; x: number; y: number };
export type StatementPage = TextItem[];

export type StatementTransaction = {
  date: string; // YYYY-MM-DD
  amount: number; // as the bank prints it: deposits positive, withdrawals negative
  description: string;
  reference: string;
  section: string; // "Electronic deposits", "ATM/Debit Card transactions", ...
  // Which identical row this is (same date, amount, description and
  // reference), so repeated lines stay separate transactions.
  occurrence: number;
};

export type ParsedStatement = {
  bank: "Comerica";
  accountLast4: string | null;
  periodStart: string;
  periodEnd: string;
  beginningBalance: number;
  endingBalance: number;
  transactions: StatementTransaction[];
  // Empty when every table matched its printed total and count and the
  // rows add up from the beginning balance to the ending one.
  problems: string[];
};

export class StatementParseError extends Error {}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONEY = /^-?\$?-?[\d,]+\.\d{2}$/;

function parseMoney(s: string): number {
  const negative = s.includes("-");
  const n = Number(s.replace(/[^\d.]/g, ""));
  return negative ? -n : n;
}

const cents = (n: number) => Math.round(n * 100);

function isoFromLong(s: string): string {
  const m = s.match(/([A-Z][a-z]+) (\d{1,2}), (\d{4})/);
  if (!m) throw new StatementParseError(`Unreadable date: ${s}`);
  const month = FULL_MONTHS.indexOf(m[1]);
  if (month < 0) throw new StatementParseError(`Unreadable month: ${m[1]}`);
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** Items on the same line of the page, top to bottom, each line left to right. */
export function groupRows(items: StatementPage): TextItem[][] {
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= 2) row.push(item);
    else rows.push([item]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

const rowText = (row: TextItem[]) => row.map((i) => i.str.trim()).join(" ").replace(/\s+/g, " ");

/** The first dollar amount on this row or the next few. */
function amountNear(rows: TextItem[][], start: number): number | null {
  for (let i = start; i < Math.min(rows.length, start + 3); i++) {
    const hit = rows[i].find((it) => MONEY.test(it.str.trim()) && it.str.includes("$"));
    if (hit) return parseMoney(hit.str);
  }
  return null;
}

export function parseStatement(pages: StatementPage[]): ParsedStatement {
  const pageRows = pages.map(groupRows);
  const allRows = pageRows.flat();
  const fullText = allRows.map(rowText).join("\n");

  if (!/Comerica/i.test(fullText)) {
    throw new StatementParseError("This doesn't look like a Comerica statement. Only Comerica checking statements can be imported so far.");
  }

  const period = fullText.match(/([A-Z][a-z]+ \d{1,2}, \d{4}) to ([A-Z][a-z]+ \d{1,2}, \d{4})/);
  if (!period) throw new StatementParseError("Couldn't find the statement period.");
  const periodStart = isoFromLong(period[1]);
  const periodEnd = isoFromLong(period[2]);
  const accountLast4 = fullText.match(/Account number \d*(\d{4})\b/)?.[1] ?? fullText.match(/X{3,}(\d{4})/)?.[1] ?? null;

  const beginIdx = allRows.findIndex((r) => /^Beginning balance/.test(rowText(r)));
  const endIdx = allRows.findIndex((r) => /^Ending balance/.test(rowText(r)));
  const beginningBalance = beginIdx >= 0 ? amountNear(allRows, beginIdx) : null;
  const endingBalance = endIdx >= 0 ? amountNear(allRows, endIdx) : null;
  if (beginningBalance === null || endingBalance === null) {
    throw new StatementParseError("Couldn't find the beginning and ending balances.");
  }

  const transactions: StatementTransaction[] = [];
  const printed = new Map<string, { total: number | null; count: number | null }>();
  let section: string | null = null;
  // Column edges, from each table's header row.
  let activityX = 200;
  let referenceX = 450;

  for (const rows of pageRows) {
    for (const row of rows) {
      const text = rowText(row);
      const heading = text.match(/^(.+) this statement period$/);
      if (heading) {
        section = heading[1];
        continue;
      }
      if (/^Date Amount \(\$\) Activity/.test(text)) {
        activityX = row.find((i) => i.str.trim() === "Activity")?.x ?? activityX;
        continue;
      }
      if (row.some((i) => i.str.trim() === "Bank" || i.str.trim() === "reference")) {
        referenceX = row.find((i) => i.str.trim() === "Bank" || i.str.trim() === "reference")?.x ?? referenceX;
      }
      const total = text.match(/^Total (?!number of)(.+?): (-?\$[\d,]+\.\d{2})$/);
      if (total && section) {
        printed.set(section, { ...(printed.get(section) ?? { count: null }), total: parseMoney(total[2]) });
        continue;
      }
      const count = text.match(/^Total number of (.+?): (\d+)$/);
      if (count && section) {
        printed.set(section, { ...(printed.get(section) ?? { total: null }), count: Number(count[2]) });
        continue;
      }

      const date = row[0]?.str.trim().match(/^([A-Z][a-z]{2}) (\d{2})$/);
      if (!date || !section || !MONTHS.includes(date[1])) continue;
      const amountItem = row.find((i) => i.x > row[0].x + 20 && i.x < activityX - 2 && MONEY.test(i.str.trim()));
      if (!amountItem) continue;

      const description = row
        .filter((i) => i.x >= activityX - 2 && i.x < referenceX - 2)
        .map((i) => i.str.trim())
        .join(" ")
        .replace(/\s+/g, " ");
      const reference = row
        .filter((i) => i.x >= referenceX - 2 && !/^\.+$/.test(i.str.trim()))
        .map((i) => i.str.trim())
        .join(" ");

      // The year: the period's end year, unless that would put the date
      // after the period (a December row on a statement ending in January).
      const month = MONTHS.indexOf(date[1]) + 1;
      let year = Number(periodEnd.slice(0, 4));
      const candidate = `${year}-${String(month).padStart(2, "0")}-${date[2]}`;
      if (candidate > periodEnd) year -= 1;
      const iso = `${year}-${String(month).padStart(2, "0")}-${date[2]}`;

      const amount = parseMoney(amountItem.str);
      const occurrence = transactions.filter(
        (t) => t.date === iso && t.amount === amount && t.description === description && t.reference === reference
      ).length;
      transactions.push({ date: iso, amount, description, reference, section, occurrence });
    }
  }

  const problems: string[] = [];
  const sections = new Set([...transactions.map((t) => t.section), ...printed.keys()]);
  for (const s of sections) {
    const rows = transactions.filter((t) => t.section === s);
    const expected = printed.get(s);
    const sum = rows.reduce((acc, t) => acc + cents(t.amount), 0);
    if (!expected || expected.total === null) problems.push(`${s}: no printed total to check against`);
    else if (sum !== cents(expected.total)) problems.push(`${s}: rows add up to ${sum / 100}, the statement says ${expected.total}`);
    if (expected?.count !== null && expected?.count !== undefined && rows.length !== expected.count) {
      problems.push(`${s}: found ${rows.length} rows, the statement says ${expected.count}`);
    }
  }
  const net = transactions.reduce((acc, t) => acc + cents(t.amount), 0);
  if (cents(beginningBalance) + net !== cents(endingBalance)) {
    problems.push(
      `Balances don't reconcile: ${beginningBalance} plus ${net / 100} isn't the ending ${endingBalance}`
    );
  }
  for (const t of transactions) {
    if (t.date < periodStart || t.date > periodEnd) problems.push(`${t.date} ${t.description} is outside the statement period`);
  }

  return {
    bank: "Comerica",
    accountLast4,
    periodStart,
    periodEnd,
    beginningBalance,
    endingBalance,
    transactions,
    problems,
  };
}

// --- Categorizing -----------------------------------------------------------
//
// A statement has no categories, so each description is matched against
// rules written from real statement text, in Plaid's category scheme so the
// rest of the app treats these exactly like synced transactions. First
// match wins; "in"/"out" limits a rule to deposits or withdrawals. Anything
// unmatched keeps a cleaned-up name and no category ("Other"), rather than
// a guess.

type Direction = "in" | "out" | "both";
type Rule = { match: RegExp; dir: Direction; merchant: string | null; primary: string; detailed: string };

const rule = (match: RegExp, dir: Direction, merchant: string | null, primary: string, detailed: string): Rule => ({
  match,
  dir,
  merchant,
  primary,
  detailed,
});

const RULES: Rule[] = [
  // Pay. A null merchant keeps the raw "United Mortgage Payroll" text as the
  // name, which the app already turns into "United Mortgage Paycheck".
  rule(/\bpayroll\b/i, "in", null, "INCOME", "INCOME_WAGES"),
  rule(/^Mortgagepros\b.*Direct Dep/i, "in", "Mortgagepros", "INCOME", "INCOME_WAGES"),
  rule(/^Lendify\b.*Direct Dep/i, "in", "Lendify Home Loans", "INCOME", "INCOME_WAGES"),
  rule(/\bDirect Dep\b/i, "in", null, "INCOME", "INCOME_WAGES"),
  rule(/^Accts Pay\b.*Invoice/i, "in", "Invoice payment", "INCOME", "INCOME_OTHER_INCOME"),
  rule(/^Doordash, Inc\./i, "in", "DoorDash payout", "INCOME", "INCOME_OTHER_INCOME"),
  rule(/^IRS Treas.*Tax Ref/i, "in", "IRS tax refund", "INCOME", "INCOME_TAX_REFUND"),
  rule(/^Stateofmichigan Income Tax/i, "in", "Michigan tax refund", "INCOME", "INCOME_TAX_REFUND"),
  rule(/^Stateofmichigan Income Tax/i, "out", "Michigan income tax", "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT"),
  rule(/Rwrd Rdm|Rewards Center Redemption/i, "in", "Card rewards", "INCOME", "INCOME_OTHER_INCOME"),

  // Card payments: excluded from spending when the card is connected here
  // (its purchases are already counted), counted when it isn't.
  rule(/^Chase Credit Crd (Epay|Autopay)/i, "out", "Chase", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
  rule(/^Applecard Gsbank/i, "out", "Apple Card", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
  rule(/^Cardmember Serv/i, "out", "Cardmember Service", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
  rule(/^Elan Web Pymt/i, "out", "Elan", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),

  // Moving money between your own accounts and apps.
  rule(/^Americanexpress Transfer/i, "out", "American Express Savings", "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"),
  rule(/^Apple Gs Savings/i, "out", "Apple Savings", "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"),
  rule(/^Apple Cash|Internal Adj Apple Cash/i, "in", null, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"),
  rule(/^Apple Cash/i, "out", null, "TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"),
  rule(/Cash App/i, "in", null, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"),
  rule(/Cash App/i, "out", null, "TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"),
  rule(/\bZelle\b/i, "in", null, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"),
  rule(/\bZelle\b/i, "out", null, "TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"),
  rule(/^Ebay .*Acctverify/i, "both", "eBay account check", "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"),
  rule(/^Ebay .*Payments/i, "in", "eBay payout", "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"),
  rule(/^Rtp From Trustly/i, "in", "Trustly transfer", "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"),
  rule(/^(Mobile )?Deposit$/i, "in", "Deposit", "TRANSFER_IN", "TRANSFER_IN_DEPOSIT"),
  rule(/^Withdrawal$|^W\/D At /i, "out", "Cash withdrawal", "TRANSFER_OUT", "TRANSFER_OUT_WITHDRAWAL"),

  // Investing and crypto.
  rule(/^Robinhood|^Rhs Brokerage/i, "in", "Robinhood", "TRANSFER_IN", "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"),
  rule(/^Robinhood|^Rhs Brokerage/i, "out", "Robinhood", "TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"),
  rule(/^Fid Bkg Svc/i, "in", "Fidelity", "TRANSFER_IN", "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"),
  rule(/^Fid Bkg Svc/i, "out", "Fidelity", "TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"),
  rule(/^Coinbase/i, "in", "Coinbase", "TRANSFER_IN", "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"),
  rule(/^Coinbase/i, "out", "Coinbase", "TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"),
  rule(/^Moonpay/i, "out", "MoonPay", "TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"),
  rule(/^Stripe\*(meld-)?phantom/i, "out", "Phantom", "TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"),

  // Betting. Deposits and winnings share a category, so the category shows
  // what was lost, net.
  rule(/Draft ?Kings/i, "both", "DraftKings", "ENTERTAINMENT", "ENTERTAINMENT_CASINOS_AND_GAMBLING"),
  rule(/Fanduel|Fd Sptsbk/i, "both", "FanDuel", "ENTERTAINMENT", "ENTERTAINMENT_CASINOS_AND_GAMBLING"),
  rule(/Czr Sb Casino/i, "both", "Caesars Sportsbook", "ENTERTAINMENT", "ENTERTAINMENT_CASINOS_AND_GAMBLING"),
  rule(/Kalshi/i, "both", "Kalshi", "ENTERTAINMENT", "ENTERTAINMENT_CASINOS_AND_GAMBLING"),
  rule(/Prizepicks/i, "both", "PrizePicks", "ENTERTAINMENT", "ENTERTAINMENT_CASINOS_AND_GAMBLING"),

  // Bank fees (a refunded fee nets against them).
  rule(/^Foreign Fee/i, "both", "Foreign transaction fee", "BANK_FEES", "BANK_FEES_FOREIGN_TRANSACTION_FEES"),
  rule(/ATM Usage Fee|^Oth Bank Fee|^Inq At /i, "both", "ATM fee", "BANK_FEES", "BANK_FEES_ATM_FEES"),
  rule(/^Maintenance Fee|E-statement Discount/i, "both", "Account fee", "BANK_FEES", "BANK_FEES_OTHER_BANK_FEES"),

  // Everyday spending.
  rule(/^Apple\.com\/bill/i, "both", "Apple", "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
  rule(/^Microsoft/i, "both", "Microsoft", "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
  rule(/^Amazon Prime/i, "both", "Amazon Prime", "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
  rule(/^Hp \*instant Ink/i, "both", "HP Instant Ink", "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
  rule(/^Spotify/i, "both", "Spotify", "ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO"),
  rule(/Edge Fitness/i, "both", "Edge Fitness Club", "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"),
  rule(/Powerhouse Gym/i, "both", "Powerhouse Gym", "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"),
  rule(/^Chipotle/i, "both", "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"),
  rule(/^Crumbl/i, "both", "Crumbl", "FOOD_AND_DRINK", "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK"),
  rule(/^Tst\*chickpea/i, "both", "Chickpea Kitchen", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"),
  rule(/^Sq \*ansara/i, "both", "Ansara", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"),
  rule(/^Sq \*kura/i, "both", "Kura Revolving Sushi", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"),
  rule(/^Merpago\*restauranbar/i, "both", "Restaurant (Mexico City)", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"),
  rule(/^Air Can/i, "both", "Air Canada", "TRAVEL", "TRAVEL_FLIGHTS"),
  rule(/^Metropolis Parking/i, "both", "Metropolis Parking", "TRANSPORTATION", "TRANSPORTATION_PARKING"),
  rule(/^Ou Ebill/i, "both", "Oakland University", "GENERAL_SERVICES", "GENERAL_SERVICES_EDUCATION"),
  rule(/^Ambassador Duty Free/i, "both", "Ambassador Duty Free", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE"),
  rule(/^Flip\.shop/i, "both", "Flip", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"),
];

/**
 * A card purchase's description without the card's last four digits,
 * country, state, phone number and processor prefix: "Tst*chickpea Ki
 * Sterling Heig MI 9307" becomes "Chickpea Ki Sterling Heig".
 */
export function cleanDescription(description: string): string {
  return description
    .replace(/\b\d{3}-\d{3}-\d{4}\b/g, "")
    .replace(/\s+\d{4}$/, "")
    .replace(/\s+USA$/i, "")
    .replace(/\s+[A-Z]{2}$/, "")
    .replace(/^(Sq|Tst|Sp|Pp)\s?\*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Categorized = { merchant_name: string | null; pfc_primary: string | null; pfc_detailed: string | null };

export function categorize(t: Pick<StatementTransaction, "description" | "amount" | "section">): Categorized {
  const dir: Direction = t.amount >= 0 ? "in" : "out";
  const hit = RULES.find((r) => (r.dir === "both" || r.dir === dir) && r.match.test(t.description));
  if (hit) return { merchant_name: hit.merchant, pfc_primary: hit.primary, pfc_detailed: hit.detailed };
  // A card purchase nobody wrote a rule for: a readable name, no category.
  return { merchant_name: /card/i.test(t.section) ? cleanDescription(t.description) : null, pfc_primary: null, pfc_detailed: null };
}

// --- Into the ledger ----------------------------------------------------------

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The id a statement row is stored under. Built only from what's on the
 * statement, so importing the same statement again finds the same ids and
 * adds nothing. Prefixed so it can never collide with a Plaid id.
 */
export function statementTransactionId(s: Pick<ParsedStatement, "bank" | "accountLast4">, t: StatementTransaction): string {
  const key = [s.bank, s.accountLast4 ?? "", t.date, cents(t.amount), t.description, t.reference, t.occurrence].join("|");
  return `stmt_${s.bank.toLowerCase()}_${t.date}_${fnv1a(key)}`;
}

export const STATEMENT_ID_PREFIX = "stmt_";

export type ExistingTransaction = { plaid_transaction_id: string; date: string; amount: number };

export type ImportPlan<T> = {
  toAdd: T[];
  alreadyImported: T[];
  // Already synced from the bank (same amount within a few days), so skipped.
  matchedSynced: T[];
};

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
// How far apart the statement's posting date and the synced date can be
// and still be the same transaction.
export const OVERLAP_DAYS = 4;

/**
 * Splits statement rows (in the ledger's sign: money out positive) into new,
 * already imported (same id) and already synced from the bank: the same
 * amount on the same account within OVERLAP_DAYS days. Each synced
 * transaction can stand in for only one statement row, closest date first.
 */
export function planImport<T extends { id: string; date: string; amount: number }>(
  rows: T[],
  existing: ExistingTransaction[]
): ImportPlan<T> {
  const importedIds = new Set(existing.filter((e) => e.plaid_transaction_id.startsWith(STATEMENT_ID_PREFIX)).map((e) => e.plaid_transaction_id));
  const synced = existing
    .filter((e) => !e.plaid_transaction_id.startsWith(STATEMENT_ID_PREFIX))
    .map((e) => ({ ...e, day: dayNumber(e.date), cents: cents(e.amount), used: false }));

  const plan: ImportPlan<T> = { toAdd: [], alreadyImported: [], matchedSynced: [] };
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (importedIds.has(row.id)) {
      plan.alreadyImported.push(row);
      continue;
    }
    const day = dayNumber(row.date);
    const c = cents(row.amount);
    let best: (typeof synced)[number] | null = null;
    for (const s of synced) {
      if (s.used || s.cents !== c) continue;
      const gap = Math.abs(s.day - day);
      if (gap <= OVERLAP_DAYS && (best === null || gap < Math.abs(best.day - day))) best = s;
    }
    if (best) {
      best.used = true;
      plan.matchedSynced.push(row);
    } else {
      plan.toAdd.push(row);
    }
  }
  return plan;
}
