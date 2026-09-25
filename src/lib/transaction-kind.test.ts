import { describe, expect, it } from "vitest";
import { filterSpendingTransactions } from "@/lib/spending-aggregation";
import { describeTransactions, inCategory, kindSummary, matchesKind, transactionKind, type KindTx } from "@/lib/transaction-kind";

const CARD = "card-sapphire";
const APPLE = "manual:apple";
const CHECKING = "checking";
const SAVINGS = "savings";
const cards = new Set([CARD, APPLE]);

let n = 0;
const tx = (o: Partial<KindTx>): KindTx => ({
  id: `t${++n}`,
  date: "2026-09-10",
  amount: 20,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "Chipotle",
  name: "CHIPOTLE",
  pending: false,
  account: { id: CARD },
  ...o,
});

describe("transactionKind", () => {
  it("tells purchases, refunds, income, transfers, card and loan payments apart", () => {
    expect(transactionKind(tx({}), cards)).toBe("spending");
    expect(transactionKind(tx({ amount: -12 }), cards)).toBe("refund");
    expect(transactionKind(tx({ amount: -3000, pfc_primary: "INCOME", account: { id: CHECKING } }), cards)).toBe("income");
    expect(transactionKind(tx({ amount: 500, pfc_primary: "TRANSFER_OUT", account: { id: CHECKING } }), cards)).toBe("transfer");
    // A payment from checking, filed by Plaid as a card payment.
    expect(
      transactionKind(tx({ amount: 809.59, pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", name: "CHASE CREDIT CRD EPAY", account: { id: CHECKING } }), cards)
    ).toBe("card-payment");
    // The same payment as the card sees it, which Plaid files as a loan it made you.
    expect(transactionKind(tx({ amount: -809.59, pfc_primary: "LOAN_DISBURSEMENTS", name: "Payment Thank You-Mobile", merchant_name: null }), cards)).toBe("card-payment");
    // Onto the card, filed as a transfer in.
    expect(transactionKind(tx({ amount: -250, pfc_primary: "TRANSFER_IN", account: { id: APPLE } }), cards)).toBe("card-payment");
    // A car payment is a loan payment, not a card payment.
    expect(transactionKind(tx({ amount: 380, pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CAR_PAYMENT", name: "HONDA FINANCIAL", account: { id: CHECKING } }), cards)).toBe("loan-payment");
    // With no detailed category, the name decides.
    expect(transactionKind(tx({ amount: 99, pfc_primary: "LOAN_PAYMENTS", pfc_detailed: null, name: "APPLECARD GSBANK PAYMENT", account: { id: CHECKING } }), cards)).toBe("card-payment");
  });
});

describe("describeTransactions", () => {
  const out = tx({ amount: 809.59, date: "2026-09-18", pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", name: "CHASE CREDIT CRD EPAY", account: { id: CHECKING } });
  const onCard = tx({ amount: -809.59, date: "2026-09-21", pfc_primary: "LOAN_PAYMENTS", name: "Payment Thank You-Mobile", merchant_name: null });
  const farOff = tx({ amount: -809.59, date: "2026-10-30", pfc_primary: "LOAN_PAYMENTS", name: "Payment Thank You-Mobile", merchant_name: null });
  const toElsewhere = tx({ amount: 120, pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", name: "CAPITAL ONE ONLINE PMT", merchant_name: null, account: { id: CHECKING } });
  const pending = tx({ pending: true, amount: 6.45 });
  const lunch = tx({});
  const all = [out, onCard, farOff, toElsewhere, pending, lunch];
  const described = describeTransactions(all, cards, ["Chase"]);

  it("pairs a payment from checking with the same amount landing on a card within a few days, both ways", () => {
    expect(described.get(out.id)).toMatchObject({ kind: "card-payment", counts: false, counterpart: CARD });
    expect(described.get(onCard.id)).toMatchObject({ kind: "card-payment", counterpart: CHECKING });
    expect(described.get(farOff.id)?.counterpart).toBeNull();
  });

  it("says a row counts as spending exactly when the Spending totals count it", () => {
    // A payment to a card that isn't connected stands in for its purchases.
    expect(described.get(toElsewhere.id)).toMatchObject({ kind: "card-payment", counts: true });
    expect(described.get(pending.id)).toMatchObject({ kind: "spending", counts: false });
    const counted = new Set(filterSpendingTransactions(all, ["Chase"]).map((t) => (t as KindTx).id));
    for (const t of all) expect(described.get(t.id)!.counts).toBe(counted.has(t.id));
  });

  it("filters by kind: Spending takes what counts, and Other takes spending with no category", () => {
    expect(all.filter((t) => matchesKind(described.get(t.id), "spending")).map((t) => t.id)).toEqual([toElsewhere.id, pending.id, lunch.id]);
    expect(all.filter((t) => matchesKind(described.get(t.id), "card-payment"))).toHaveLength(4);
    expect(inCategory(toElsewhere, "OTHER", described.get(toElsewhere.id))).toBe(true);
    expect(inCategory(lunch, "OTHER", described.get(lunch.id))).toBe(false);
    expect(inCategory(lunch, "FOOD_AND_DRINK", described.get(lunch.id))).toBe(true);
  });
});

describe("kindSummary", () => {
  it("adds spending up the way Spending does, and keeps card payments and transfers apart from it", () => {
    const rows = [
      tx({ amount: 100, paid_back: 60 }), // your share is $40
      tx({ amount: 30 }),
      tx({ amount: -10 }), // a refund
      tx({ amount: 5, pending: true }),
      tx({ amount: -3000, pfc_primary: "INCOME", account: { id: CHECKING } }),
      tx({ amount: 500, pfc_primary: "TRANSFER_OUT", account: { id: CHECKING } }),
      tx({ amount: -500, pfc_primary: "TRANSFER_IN", account: { id: SAVINGS } }),
      tx({ amount: 809.59, pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", name: "CHASE CREDIT CRD EPAY", merchant_name: null, account: { id: CHECKING } }),
      tx({ amount: -809.59, pfc_primary: "LOAN_PAYMENTS", name: "Payment Thank You", merchant_name: null }),
    ];
    const s = kindSummary(rows, describeTransactions(rows, cards, ["Chase"]));
    const spendingTotal = filterSpendingTransactions(rows, ["Chase"]).reduce((x, t) => x + t.amount, 0);
    expect(s.spending).toBe(60);
    expect(s.spending).toBe(Math.round(spendingTotal * 100) / 100);
    expect(s).toMatchObject({ refunds: 10, income: 3000, transfers: 2, cardPayments: { count: 1, amount: 809.59 } });
    // The largest purchase is a purchase, not the $809.59 card payment.
    expect(s.largestExpense).toBe(40);
    expect(s.averageExpense).toBe(35);
  });
});
