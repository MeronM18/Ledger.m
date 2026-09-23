import { describe, expect, it } from "vitest";
import { computeNetWorth } from "@/lib/net-worth";

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
