import { describe, expect, it } from "vitest";
import { breakdown, donutSlices, EVERYTHING_ELSE, inRange, monthSpanLabel, overTimeMonths, periodRange, rangeLabel } from "@/lib/spending-report";
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
    expect(b.credits).toBe(0);
  });

  it("totals by merchant as they're shown, net of credits no merchant absorbs", () => {
    const b = breakdown(rows, "merchant");
    expect(b.items.map((i) => [i.key, i.amount])).toEqual([
      ["Shell", 100],
      ["Kroger", 30],
    ]);
    // A fee and its waiver are different merchants: the waiver is a credit.
    const fee = [tx({ amount: 13, pfc_primary: "BANK_FEES", merchant_name: "Maintenance Fee" }), tx({ amount: -13, pfc_primary: "BANK_FEES", merchant_name: "Maintenance Fee Waiver" })];
    const byMerchant = breakdown([...rows, ...fee], "merchant");
    const byCategory = breakdown([...rows, ...fee], "category");
    expect(byMerchant).toMatchObject({ gross: 143, credits: -13, total: 130 });
    expect(byCategory.total).toBe(byMerchant.total);
  });

  it("puts the rest of a long list together as Everything else", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ key: `k${i}`, label: `k${i}`, amount: 15 - i, colorSlot: 1 }));
    const slices = donutSlices(items, 12);
    expect(slices).toHaveLength(12);
    expect(slices.at(-1)).toMatchObject({ key: EVERYTHING_ELSE, amount: 4 + 3 + 2 + 1 });
  });
});

describe("overTimeMonths", () => {
  const today = "2026-09-24";
  const at = (period: string, earliest: string | null = "2024-10") => overTimeMonths(periodRange(period, today), today, earliest);

  it("puts a single month in the year leading up to it, and compares that month", () => {
    const { months, highlight } = at("this-month");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months.at(-1)).toBe("2026-09");
    expect(highlight).toBe("2026-09");
    expect(at("2026-05")).toMatchObject({ highlight: "2026-05" });
    expect(at("2026-05").months.at(-1)).toBe("2026-05");
    expect(at("last-month").highlight).toBe("2026-08");
  });

  it("draws exactly the months of a longer period, up to this one", () => {
    expect(at("last-3-months").months).toEqual(["2026-07", "2026-08", "2026-09"]);
    const year = at("this-year");
    expect(year.months[0]).toBe("2026-01");
    expect(year.months.at(-1)).toBe("2026-09");
    expect(at("last-year")).toMatchObject({ highlight: "2025-12" });
    expect(at("last-year").months).toHaveLength(12);
  });

  it("goes back no further than the history, and no more than two years", () => {
    expect(at("this-month", "2026-06").months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(at("all", "2020-01").months).toHaveLength(24);
    expect(at("all", "2020-01").months.at(-1)).toBe("2026-09");
  });

  it("names the span it draws", () => {
    expect(monthSpanLabel(at("this-month").months)).toBe("Oct 2025 – Sep 2026");
    expect(monthSpanLabel(["2026-09"])).toBe("Sep 2026");
  });
});
