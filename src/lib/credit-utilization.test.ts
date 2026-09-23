import { describe, expect, it } from "vitest";
import {
  cardLabel,
  payDownTo,
  summarizeUtilization,
  utilizationBand,
  type CreditCard,
} from "@/lib/credit-utilization";

const card = (o: Partial<CreditCard> & { id: string }): CreditCard => ({
  name: "Freedom",
  mask: "4657",
  institution: "Chase",
  balance: 0,
  limit: 1000,
  ...o,
});

describe("utilizationBand", () => {
  it("draws the lines at 10%, 30% and 50%", () => {
    expect(utilizationBand(0)).toBe("excellent");
    expect(utilizationBand(0.099)).toBe("excellent");
    expect(utilizationBand(0.1)).toBe("good");
    expect(utilizationBand(0.299)).toBe("good");
    expect(utilizationBand(0.3)).toBe("fair");
    expect(utilizationBand(0.499)).toBe("fair");
    expect(utilizationBand(0.5)).toBe("high");
    expect(utilizationBand(1.4)).toBe("high");
  });
});

describe("payDownTo", () => {
  it("is what to pay to reach the target, never negative", () => {
    expect(payDownTo(600, 1000, 0.3)).toBe(300);
    expect(payDownTo(200, 1000, 0.3)).toBe(0);
  });
});

describe("summarizeUtilization", () => {
  it("computes per-card and overall utilization from totals, not an average of percentages", () => {
    const s = summarizeUtilization([
      card({ id: "a", balance: 500, limit: 1000 }), // 50%
      card({ id: "b", balance: 100, limit: 9000 }), // ~1.1%
    ]);
    expect(s.totalBalance).toBe(600);
    expect(s.totalLimit).toBe(10000);
    expect(s.overall).toBeCloseTo(0.06);
    expect(s.overallBand).toBe("excellent");
    // An average of the two percentages would have said ~26%.
    expect(s.cards.map((c) => c.id)).toEqual(["a", "b"]); // highest first
    expect(s.cards[0]).toMatchObject({ band: "high", payDownToGood: 200, payDownToExcellent: 400 });
  });

  it("keeps cards with no limit out of the overall figure", () => {
    const s = summarizeUtilization([
      card({ id: "a", balance: 200, limit: 1000 }),
      card({ id: "nolimit", balance: 900, limit: null }),
      card({ id: "zero", balance: 50, limit: 0 }),
    ]);
    expect(s.unrated.map((c) => c.id)).toEqual(["nolimit", "zero"]);
    expect(s.overall).toBeCloseTo(0.2);
  });

  it("treats an overpaid (negative) balance as nothing owed", () => {
    const s = summarizeUtilization([card({ id: "a", balance: -40, limit: 1000 })]);
    expect(s.cards[0]).toMatchObject({ balance: 0, utilization: 0, band: "excellent" });
  });

  it("reports no overall figure when nothing can be rated", () => {
    const s = summarizeUtilization([card({ id: "x", limit: null })]);
    expect(s.overall).toBeNull();
    expect(s.overallBand).toBeNull();
    expect(s.overallPayDownToGood).toBe(0);
    expect(summarizeUtilization([]).overall).toBeNull();
  });

  it("gives the overall pay-down needed to reach 30%", () => {
    const s = summarizeUtilization([card({ id: "a", balance: 800, limit: 1000 }), card({ id: "b", balance: 0, limit: 1000 })]);
    expect(s.overall).toBeCloseTo(0.4);
    expect(s.overallPayDownToGood).toBeCloseTo(200);
  });
});

describe("cardLabel", () => {
  it("adds the institution unless the name already has it, and the last four", () => {
    expect(cardLabel({ name: "Freedom", mask: "4657", institution: "Chase" })).toBe("Chase Freedom ••4657");
    expect(cardLabel({ name: "Chase Sapphire", mask: null, institution: "Chase" })).toBe("Chase Sapphire");
    expect(cardLabel({ name: "Card", mask: "1", institution: null })).toBe("Card ••1");
  });
});
