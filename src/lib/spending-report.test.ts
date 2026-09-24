import { describe, expect, it } from "vitest";
import { breakdown, donutSlices, EVERYTHING_ELSE, inRange, periodRange, rangeLabel } from "@/lib/spending-report";
import type { SpendingTransaction } from "@/lib/spending-aggregation";

const tx = (o: Partial<SpendingTransaction>): SpendingTransaction => ({
  date: "2026-09-10",
  amount: 10,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "Kroger",
  name: null,
  pending: false,
  ...o,
});

describe("periodRange", () => {
  const today = "2026-09-24";
  it("covers the calendar month, last month across a new year, and the last three months", () => {
    expect(periodRange("this-month", today)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(periodRange("last-month", "2026-01-15")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(periodRange("last-3-months", "2026-02-10")).toEqual({ start: "2025-12-01", end: "2026-02-28" });
    expect(periodRange("this-year", today)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(periodRange("2024-02", today)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(periodRange("all", today)).toEqual({ start: null, end: null });
  });

  it("reads a range as it's shown, ending today at the latest", () => {
    expect(rangeLabel(periodRange("this-month", "2026-09-24"), "2026-09-24", null)).toBe("Sep 1 – Sep 24, 2026");
    expect(rangeLabel(periodRange("last-3-months", "2026-02-10"), "2026-02-10", null)).toBe("Dec 1, 2025 – Feb 10, 2026");
    expect(rangeLabel({ start: null, end: null }, "2026-09-24", null)).toBe("All time");
    expect(inRange("2026-09-30", periodRange("this-month", "2026-09-24"))).toBe(true);
    expect(inRange("2026-10-01", periodRange("this-month", "2026-09-24"))).toBe(false);
  });
});

describe("breakdown", () => {
  const rows = [
    tx({ amount: 30 }),
    tx({ amount: 20, merchant_name: "Chipotle" }),
    tx({ amount: 100, pfc_primary: "TRANSPORTATION", merchant_name: "Shell" }),
    // A refund comes off its category; a category netting to nothing drops out.
    tx({ amount: -20, merchant_name: "Chipotle" }),
    tx({ amount: 5, pfc_primary: "ENTERTAINMENT", merchant_name: "Netflix" }),
    tx({ amount: -5, pfc_primary: "ENTERTAINMENT", merchant_name: "Netflix" }),
  ];

  it("totals by category, largest first, net of refunds", () => {
    const b = breakdown(rows, "category");
    expect(b.items.map((i) => [i.label, i.amount])).toEqual([
      ["Transportation", 100],
      ["Food & Drink", 30],
    ]);
    expect(b.total).toBe(130);
  });

  it("totals by merchant as they're shown", () => {
    const b = breakdown(rows, "merchant");
    expect(b.items.map((i) => [i.key, i.amount])).toEqual([
      ["Shell", 100],
      ["Kroger", 30],
    ]);
  });

  it("puts the rest of a long list together as Everything else", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ key: `k${i}`, label: `k${i}`, amount: 15 - i, colorSlot: 1 }));
    const slices = donutSlices(items, 12);
    expect(slices).toHaveLength(12);
    expect(slices.at(-1)).toMatchObject({ key: EVERYTHING_ELSE, amount: 4 + 3 + 2 + 1 });
  });
});
