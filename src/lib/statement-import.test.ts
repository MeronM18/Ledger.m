import { describe, expect, it } from "vitest";
import {
  categorize,
  cleanDescription,
  parseStatement,
  planImport,
  StatementParseError,
  statementTransactionId,
  type StatementPage,
} from "@/lib/statement-import";

// A made-up statement laid out like Comerica's: text items at the same x
// positions its PDFs use (date 72, amount ~170, activity 216, reference 468).
function page(lines: (string | [string, string, string, string])[]): StatementPage {
  let y = 760;
  return lines.flatMap((line) => {
    y -= 12;
    if (typeof line === "string") return [{ str: line, x: 72, y }];
    const [date, amount, activity, ref] = line;
    return [
      { str: date, x: 72, y },
      { str: amount, x: 170, y },
      { str: activity, x: 216, y },
      { str: ref, x: 468, y },
      { str: "............", x: 72, y: y - 6 },
    ];
  });
}

const header = [
  { str: "Date", x: 72, y: 0 },
  { str: "Amount ($)", x: 159, y: 0 },
  { str: "Activity", x: 216, y: 0 },
  { str: "Bank", x: 468, y: 0 },
];

function statement(deposits: [string, string, string, string][], withdrawals: [string, string, string, string][], opts: { begin: string; end: string; depositTotal: string; withdrawalTotal: string }): StatementPage[] {
  const summary = page([
    "Your Comerica Access Checking statement",
    "December 13, 2025 to January 14, 2026",
    "Account number 6800001234",
  ]);
  summary.push({ str: "Beginning balance", x: 72, y: 600 }, { str: opts.begin, x: 480, y: 600 });
  summary.push({ str: "Ending balance", x: 72, y: 560 }, { str: "on January 14, 2026", x: 72, y: 550 }, { str: opts.end, x: 480, y: 550 });

  const detail = page([
    "Electronic deposits this statement period",
    "HEADER",
    ...deposits,
    `Total Electronic Deposits: ${opts.depositTotal}`,
    `Total number of Electronic Deposits: ${deposits.length}`,
    "Electronic withdrawals this statement period",
    "HEADER",
    ...withdrawals,
    `Total Electronic Withdrawals: ${opts.withdrawalTotal}`,
    `Total number of Electronic Withdrawals: ${withdrawals.length}`,
  ]).flatMap((item) => (item.str === "HEADER" ? header.map((h) => ({ ...h, y: item.y })) : [item]));

  return [summary, detail];
}

const deposits: [string, string, string, string][] = [
  ["Dec 15", "3,000.00", "United Mortgage Payroll 251215", "9488000001"],
  ["Jan 02", "10.00", "Zelle Jane Doe", "ZPC0001"],
];
const withdrawals: [string, string, string, string][] = [
  ["Dec 20", "-500.00", "Chase Credit Crd Epay 251220", "9488000002"],
  ["Jan 05", "-0.16", "Foreign Fee Air Can Paris Fr Fra 7941", "MS0120 0"],
  ["Jan 05", "-0.16", "Foreign Fee Air Can Paris Fr Fra 7941", "MS0120 0"],
];
const good = { begin: "$100.00", end: "$2,609.68", depositTotal: "$3,010.00", withdrawalTotal: "-$500.32" };

describe("parseStatement", () => {
  const s = parseStatement(statement(deposits, withdrawals, good));

  it("reads the period, account, balances and every row", () => {
    expect(s).toMatchObject({ bank: "Comerica", accountLast4: "1234", periodStart: "2025-12-13", periodEnd: "2026-01-14", beginningBalance: 100, endingBalance: 2609.68 });
    expect(s.transactions).toHaveLength(5);
    expect(s.problems).toEqual([]);
  });

  it("puts December rows in the earlier year on a statement that ends in January", () => {
    expect(s.transactions.map((t) => t.date)).toEqual(["2025-12-15", "2026-01-02", "2025-12-20", "2026-01-05", "2026-01-05"]);
  });

  it("keeps signs, descriptions and references, and numbers identical rows", () => {
    expect(s.transactions[2]).toMatchObject({ amount: -500, description: "Chase Credit Crd Epay 251220", section: "Electronic withdrawals" });
    expect(s.transactions[3]).toMatchObject({ reference: "MS0120 0", occurrence: 0 });
    expect(s.transactions[4]).toMatchObject({ reference: "MS0120 0", occurrence: 1 });
  });

  it("reports rows that don't add up to the printed totals or balances", () => {
    const off = parseStatement(statement(deposits, withdrawals, { ...good, depositTotal: "$3,020.00", end: "$2,600.00" }));
    expect(off.problems.join(" ")).toMatch(/Electronic deposits: rows add up to 3010/);
    expect(off.problems.join(" ")).toMatch(/Balances don't reconcile/);
  });

  it("refuses a statement from another bank", () => {
    expect(() => parseStatement([page(["Some Other Bank statement"])])).toThrow(StatementParseError);
  });
});

describe("categorize", () => {
  const c = (description: string, amount: number, section = "Electronic deposits") => categorize({ description, amount, section });

  it("files pay, card payments, transfers and purchases like Plaid would", () => {
    expect(c("United Mortgage Payroll 260817", 8942)).toEqual({ merchant_name: null, pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES" });
    expect(c("Mortgagepros Llc Direct Dep 250101", 700).pfc_detailed).toBe("INCOME_WAGES");
    expect(c("Chase Credit Crd Epay 260813", -7941).pfc_detailed).toBe("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
    expect(c("Apple Cash Sent Money Cupertino CA USA 7941", -115).pfc_primary).toBe("TRANSFER_OUT");
    expect(c("Apple Cash Bank Xfer Meron Matti", 100).pfc_primary).toBe("TRANSFER_IN");
    expect(c("Zelle Stev Trucking", 180).pfc_primary).toBe("TRANSFER_IN");
    expect(c("Withdrawal", -360).pfc_detailed).toBe("TRANSFER_OUT_WITHDRAWAL");
    expect(c("Edge Fitness Abc Club Fees", -19.99)).toMatchObject({ merchant_name: "Edge Fitness Club", pfc_primary: "PERSONAL_CARE" });
  });

  it("puts bets and winnings in one category, so it nets", () => {
    expect(c("Draft Kings Boston MA 7941", -50).pfc_detailed).toBe("ENTERTAINMENT_CASINOS_AND_GAMBLING");
    expect(c("Rtp From Draftkings Credit Via Trustly", 70).pfc_detailed).toBe("ENTERTAINMENT_CASINOS_AND_GAMBLING");
  });

  it("gives an unknown card purchase a readable name and no category", () => {
    expect(c("Tst*chickpea Ki Sterling Heig MI 9307", -12.62, "ATM/Debit Card transactions").pfc_primary).toBe("FOOD_AND_DRINK");
    expect(c("Joe's Diner Troy MI USA 9307", -20, "ATM/Debit Card transactions")).toEqual({ merchant_name: "Joe's Diner Troy", pfc_primary: null, pfc_detailed: null });
    expect(cleanDescription("Hp *instant Ink 855-785-2777 CA USA 9307")).toBe("Hp *instant Ink");
  });
});

describe("statementTransactionId", () => {
  const s = parseStatement(statement(deposits, withdrawals, good));

  it("is the same every time the statement is read, and different for identical rows", () => {
    const again = parseStatement(statement(deposits, withdrawals, good));
    expect(statementTransactionId(s, s.transactions[0])).toBe(statementTransactionId(again, again.transactions[0]));
    expect(statementTransactionId(s, s.transactions[3])).not.toBe(statementTransactionId(s, s.transactions[4]));
    expect(statementTransactionId(s, s.transactions[0])).toMatch(/^stmt_comerica_2025-12-15_/);
  });
});

describe("planImport", () => {
  const rows = [
    { id: "stmt_a", date: "2026-09-01", amount: 48 },
    { id: "stmt_b", date: "2026-09-02", amount: 48 },
    { id: "stmt_c", date: "2026-09-03", amount: 19.99 },
    { id: "stmt_d", date: "2026-08-01", amount: 100 },
  ];

  it("skips rows the bank already synced (same amount within a few days), one match each", () => {
    const plan = planImport(rows, [
      { plaid_transaction_id: "plaid1", date: "2026-09-03", amount: 48 },
      { plaid_transaction_id: "plaid2", date: "2026-09-20", amount: 19.99 },
    ]);
    expect(plan.matchedSynced.map((r) => r.id)).toEqual(["stmt_a"]);
    expect(plan.toAdd.map((r) => r.id)).toEqual(["stmt_d", "stmt_b", "stmt_c"]);
  });

  it("skips rows imported before", () => {
    const plan = planImport(rows, [{ plaid_transaction_id: "stmt_d", date: "2026-08-01", amount: 100 }]);
    expect(plan.alreadyImported.map((r) => r.id)).toEqual(["stmt_d"]);
    expect(plan.toAdd).toHaveLength(3);
  });
});
