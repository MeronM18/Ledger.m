import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, countedAccount, nextBaselines, resolveGoalOptions } from "@/lib/goal-options";

describe("resolveGoalOptions", () => {
  it("keeps what's valid and drops the rest", () => {
    const out = resolveGoalOptions({
      g1: { icon: "plane", color: "travel", tracking: "growth", shares: { "plaid:a": 50, "plaid:b": 400 }, baselines: { "plaid:a": 1000 }, since: "2026-09-01" },
      g2: { icon: "rocket", color: "neon", tracking: "weird" },
      g3: "nope",
    });
    expect(out.g1).toEqual({ icon: "plane", color: "travel", tracking: "growth", shares: { "plaid:a": 50 }, baselines: { "plaid:a": 1000 }, since: "2026-09-01" });
    expect(out.g2).toEqual(DEFAULT_OPTIONS);
    expect(out.g3).toBeUndefined();
  });
});

describe("countedAccount", () => {
  const txs = [{ amount: -200 }, { amount: 50 }];

  it("counts the whole balance by default", () => {
    expect(countedAccount("plaid:a", 1000, txs, DEFAULT_OPTIONS)).toEqual({ balance: 1000, transactions: txs });
  });

  it("counts a share of the balance and its transactions", () => {
    const out = countedAccount("plaid:a", 1000, txs, { ...DEFAULT_OPTIONS, shares: { "plaid:a": 40 } });
    expect(out.balance).toBe(400);
    expect(out.transactions.map((t) => t.amount)).toEqual([-80, 20]);
  });

  it("counts only growth past the baseline", () => {
    expect(countedAccount("plaid:a", 1300, txs, { ...DEFAULT_OPTIONS, tracking: "growth", baselines: { "plaid:a": 1000 } }).balance).toBe(300);
    // With a share too, both the balance and baseline are shared.
    expect(countedAccount("plaid:a", 1300, txs, { ...DEFAULT_OPTIONS, tracking: "growth", baselines: { "plaid:a": 1000 }, shares: { "plaid:a": 50 } }).balance).toBe(150);
  });
});

describe("nextBaselines", () => {
  it("keeps existing ones, starts new ones today, drops removed ones", () => {
    const balances = new Map([
      ["plaid:a", 1500],
      ["plaid:b", 800],
    ]);
    expect(nextBaselines(["plaid:a", "plaid:b"], { "plaid:a": 1000, "plaid:c": 5 }, balances)).toEqual({ "plaid:a": 1000, "plaid:b": 800 });
  });
});
