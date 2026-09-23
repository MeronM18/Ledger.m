import { describe, expect, it } from "vitest";
import { streamDisplayName, prettyName } from "@/lib/transaction-display";
import { monthlyIncomeVsSpending, type SpendingTransaction } from "@/lib/spending-aggregation";
import { cardLabel } from "@/lib/credit-utilization";

describe("streamDisplayName", () => {
  it("turns a raw payroll descriptor into a paycheck name", () => {
    expect(
      streamDisplayName({ merchant_name: null, description: "UNITED MORTGAGE PAYROLL 925644358895XMS 091526" }, "inflow")
    ).toBe("United Mortgage Paycheck");
  });

  it("title-cases a shouting subscription name", () => {
    expect(streamDisplayName({ merchant_name: null, description: "ANNUAL MEMBERSHIP FEE" })).toBe("Annual Membership Fee");
  });

  it("uses a merchant name Plaid already resolved, and falls back when there is nothing", () => {
    expect(streamDisplayName({ merchant_name: "Edge Fitness Club", description: "EDGE FITNESS 8005" })).toBe("Edge Fitness Club");
    expect(streamDisplayName({ merchant_name: null, description: null }, "outflow", "Recurring bill")).toBe("Recurring bill");
  });
});

describe("prettyName", () => {
  it("title-cases capitals but leaves mixed case alone", () => {
    expect(prettyName("FIFTH THIRD MOMENTUM CHECKING")).toBe("Fifth Third Momentum Checking");
    expect(prettyName("High Yield Savings Account")).toBe("High Yield Savings Account");
    expect(prettyName("CREDIT CARD")).toBe("Credit Card");
  });

  it("is used for card labels, so a bank's capitals don't mix with a normal institution name", () => {
    expect(cardLabel({ name: "CREDIT CARD", mask: "4657", institution: "Chase" })).toBe("Chase Credit Card ••4657");
  });
});

describe("monthlyIncomeVsSpending counts spending the way the spending card does", () => {
  const cardPayment = (merchant: string): SpendingTransaction => ({
    date: "2026-09-21",
    amount: 789.11,
    pfc_primary: "LOAN_PAYMENTS",
    pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
    merchant_name: merchant,
    name: merchant,
    pending: false,
  });
  const groceries: SpendingTransaction = {
    date: "2026-09-10",
    amount: 100,
    pfc_primary: "FOOD_AND_DRINK",
    merchant_name: "Store",
    name: "STORE",
    pending: false,
  };

  it("includes a payment to a card that isn't connected", () => {
    const rows = [groceries, cardPayment("Apple Card")];
    expect(monthlyIncomeVsSpending(rows, 2026, 8, ["Chase"]).spending).toBeCloseTo(889.11);
  });

  it("still leaves out a payment to a connected card, and matches the old behavior with no issuers given", () => {
    const rows = [groceries, cardPayment("Chase Card Payment")];
    expect(monthlyIncomeVsSpending(rows, 2026, 8, ["Chase"]).spending).toBe(100);
    expect(monthlyIncomeVsSpending([groceries, cardPayment("Apple Card")], 2026, 8).spending).toBe(100);
  });
});
