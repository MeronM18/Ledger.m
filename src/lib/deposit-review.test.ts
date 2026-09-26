import { describe, expect, it } from "vitest";
import {
  chargeOptions,
  depositReviewAlerts,
  depositsToReview,
  incomeOf,
  resolveDepositReviews,
  reviewedDeposits,
  reviewSummary,
  suggestCharges,
  type ChargeOption,
  type ReviewableTx,
} from "@/lib/deposit-review";
import { incomeAmount } from "@/lib/spending-aggregation";

const checking = { id: "checking", name: "Total Checking", mask: "1234" };
const savings = { id: "savings", name: "Savings", mask: "0042" };
const card = { id: "card", name: "Freedom", mask: "7788" };
const cardIds = new Set(["card"]);
const TODAY = "2026-09-25";

let n = 0;
function tx(over: Partial<ReviewableTx>): ReviewableTx {
  n++;
  return {
    id: `t${n}`,
    date: "2026-09-20",
    amount: -50,
    pfc_primary: "TRANSFER_IN",
    pfc_detailed: "TRANSFER_IN_ACCOUNT_TRANSFER",
    merchant_name: null,
    name: "Zelle payment from JORDAN LEE",
    pending: false,
    isManual: false,
    account: checking,
    ...over,
  };
}

describe("depositsToReview", () => {
  it("asks about a Zelle deposit", () => {
    const zelle = tx({});
    const [d] = depositsToReview([zelle], cardIds, {}, TODAY);
    expect(d).toMatchObject({ id: zelle.id, amount: 50, name: "Zelle Transfer", detail: "Zelle payment from JORDAN LEE", account: checking });
  });

  it("leaves out pay, interest, charges, refunds and pending deposits", () => {
    const list = [
      tx({ name: "UNITED MORTGAGE PAYROLL 9256", pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES" }),
      tx({ name: "INTEREST PAYMENT", pfc_primary: "INCOME", pfc_detailed: "INCOME_INTEREST_EARNED", account: savings }),
      tx({ amount: 20, name: "KROGER", pfc_primary: "FOOD_AND_DRINK" }),
      tx({ name: "AMAZON REFUND", merchant_name: "Amazon", pfc_primary: "GENERAL_MERCHANDISE" }),
      tx({ pending: true }),
    ];
    expect(depositsToReview(list, cardIds, {}, TODAY)).toEqual([]);
  });

  it("leaves out money onto a card and entries made by hand", () => {
    expect(depositsToReview([tx({ account: card }), tx({ isManual: true, account: null })], cardIds, {}, TODAY)).toEqual([]);
  });

  it("leaves out ones answered, given a category, or too old", () => {
    const answered = tx({});
    const list = [answered, tx({ category_override: "INCOME" }), tx({ date: "2026-07-01" })];
    const reviews = resolveDepositReviews({ [answered.id]: { answer: "income", amount: 50, at: "", previousCategory: null } });
    expect(depositsToReview(list, cardIds, reviews, TODAY)).toEqual([]);
  });

  it("leaves out the other side of a transfer between your own accounts", () => {
    const list = [
      tx({ amount: 300, name: "ONLINE TRANSFER TO SAVINGS", pfc_primary: "TRANSFER_OUT", date: "2026-09-16" }),
      tx({ amount: -300, name: "TRANSFER FROM CHASE CHECKING", account: savings, date: "2026-09-17" }),
    ];
    expect(depositsToReview(list, cardIds, {}, TODAY)).toEqual([]);
  });

  it("asks about a check or a deposit with no category", () => {
    const list = [tx({ name: "MOBILE DEPOSIT", pfc_primary: "TRANSFER_IN", pfc_detailed: "TRANSFER_IN_DEPOSIT" }), tx({ name: "DEPOSIT", pfc_primary: null })];
    expect(depositsToReview(list, cardIds, {}, TODAY)).toHaveLength(2);
  });
});

describe("chargeOptions and suggestCharges", () => {
  const charges = [
    tx({ amount: 100, name: "OLIVE GARDEN", merchant_name: "Olive Garden", pfc_primary: "FOOD_AND_DRINK", account: card, date: "2026-09-18" }),
    tx({ amount: 50, name: "KROGER", merchant_name: "Kroger", pfc_primary: "FOOD_AND_DRINK", account: card, date: "2026-09-02" }),
    tx({ amount: 80, name: "SHELL", merchant_name: "Shell", pfc_primary: "TRANSPORTATION", account: card, date: "2026-09-19", paid_back: 80 } as Partial<ReviewableTx>),
    tx({ amount: 12, name: "CHIPOTLE", merchant_name: "Chipotle", pfc_primary: "FOOD_AND_DRINK", account: card, date: "2026-09-19" }),
    tx({ amount: 30, name: "PENDING", pfc_primary: "FOOD_AND_DRINK", pending: true, account: card }),
  ];

  it("lists spending with something left to pay back", () => {
    const options = chargeOptions(charges, "2026-09-20", []);
    expect(options.map((o) => o.name)).toEqual(["Chipotle", "Olive Garden", "Kroger"]);
    expect(options[1]).toMatchObject({ remaining: 100, account: "Freedom ••7788" });
  });

  it("puts an exact match first, then an even share, and drops charges too small", () => {
    const options = chargeOptions(charges, "2026-09-20", []);
    expect(suggestCharges({ date: "2026-09-20", amount: 50 }, options).map((o) => o.name)).toEqual(["Kroger", "Olive Garden"]);
    expect(suggestCharges({ date: "2026-09-20", amount: 25 }, options).map((o) => o.name)).toEqual(["Olive Garden", "Kroger"]);
  });

  it("goes by what's left of a charge partly paid back", () => {
    const options: ChargeOption[] = [{ id: "x", manual: false, date: "2026-09-10", name: "Dinner", amount: 90, remaining: 60, account: null }];
    expect(suggestCharges({ date: "2026-09-20", amount: 60 }, options)).toHaveLength(1);
  });
});

describe("depositReviewAlerts", () => {
  it("pushes only for recent deposits, linking to the Overview", () => {
    const deposits = depositsToReview([tx({ date: "2026-09-24" }), tx({ date: "2026-09-10" })], cardIds, {}, TODAY);
    const alerts = depositReviewAlerts(deposits, TODAY, "USD");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "deposit-review", title: "$50.00 came in: what was it?", href: "/#deposits-to-review" });
  });
});

describe("resolveDepositReviews", () => {
  it("keeps good answers and drops the rest", () => {
    const reviews = resolveDepositReviews({
      a: { answer: "paid-back", amount: 25, at: "x", previousCategory: null, charge: { id: "c", manual: true, applied: 25 } },
      b: { answer: "nope", amount: 1 },
      c: "bad",
    });
    expect(Object.keys(reviews)).toEqual(["a"]);
    // An answer saved before splits is one part of all of it.
    expect(reviews.a.parts).toEqual([{ answer: "paid-back", amount: 25, charge: { id: "c", manual: true, applied: 25 } }]);
    expect(resolveDepositReviews(null)).toEqual({});
  });

  it("reads a split answer", () => {
    const reviews = resolveDepositReviews({
      a: {
        amount: 150,
        at: "x",
        previousCategory: null,
        parts: [
          { answer: "own-money", amount: 100, from: "cash", cashDelta: -100 },
          { answer: "income", amount: 50 },
          { answer: "bogus", amount: 1 },
        ],
      },
    });
    expect(reviews.a.parts).toHaveLength(2);
    expect(incomeOf(reviews.a)).toBe(50);
    expect(reviewSummary(reviews.a)).toBe("$100.00 from my cash · $50.00 income");
  });
});

describe("reviewedDeposits", () => {
  it("lists answered deposits with what they were", () => {
    const zelle = tx({ amount: -150, date: "2026-09-21" });
    const reviews = resolveDepositReviews({
      [zelle.id]: { amount: 150, at: "", previousCategory: null, parts: [{ answer: "own-money", amount: 100, from: "cash" }, { answer: "income", amount: 50 }] },
    });
    const [r] = reviewedDeposits([zelle, tx({})], reviews);
    expect(r).toMatchObject({ id: zelle.id, amount: 150, name: "Zelle Transfer", summary: "$100.00 from my cash · $50.00 income" });
    expect(r.parts).toEqual([
      { label: "From my cash", amount: 100, answer: "own-money", from: "cash" },
      { label: "Income", amount: 50, answer: "income" },
    ]);
  });
});

describe("incomeAmount", () => {
  it("counts only the income part of a split deposit", () => {
    expect(incomeAmount(tx({ amount: -150, income_share: 50 }))).toBe(50);
    expect(incomeAmount(tx({ amount: -150 }))).toBe(150);
  });
});
