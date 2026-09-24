import { describe, expect, it } from "vitest";
import { computeNetWorth, manualAccountsAsAccounts } from "@/lib/net-worth";

describe("computeNetWorth", () => {
  it("subtracts credit and loan balances, adds everything else", () => {
    const r = computeNetWorth(
      [
        { type: "depository", current_balance: 1000 },
        { type: "investment", current_balance: 500 },
        { type: "credit", current_balance: 200 },
        { type: "loan", current_balance: 300 },
      ],
      [
        { value: 100, is_liability: false },
        { value: 50, is_liability: true },
      ],
      25
    );
    expect(r.totalAssets).toBe(1625);
    expect(r.totalLiabilities).toBe(550);
    expect(r.netWorth).toBe(1075);
  });

  it("treats a null balance as zero", () => {
    expect(computeNetWorth([{ type: "depository", current_balance: null }], []).netWorth).toBe(0);
  });
});

describe("manualAccountsAsAccounts", () => {
  it("makes a card a liability and a savings account an asset", () => {
    const accounts = manualAccountsAsAccounts([
      { type: "credit", balance: 153.04, balanceKnown: true },
      { type: "credit", balance: -20, balanceKnown: true },
      { type: "depository", balance: 334.38, balanceKnown: true },
    ]);
    expect(accounts).toEqual([
      { type: "credit", current_balance: 153.04 },
      { type: "credit", current_balance: 0 },
      { type: "depository", current_balance: 334.38 },
    ]);
    expect(computeNetWorth([{ type: "depository", current_balance: 1000 }, ...accounts], []).netWorth).toBeCloseTo(1181.34);
  });

  it("leaves out a savings account whose balance hasn't been entered", () => {
    expect(manualAccountsAsAccounts([{ type: "depository", balance: 0, balanceKnown: false }])).toEqual([]);
  });
});
