import { describe, expect, it } from "vitest";
import { categoryChanges, dailyAverage, dailyCumulative, paceComparison, previousMonth, typicalMonth } from "@/lib/trends";
import type { SpendingTransaction } from "@/lib/spending-aggregation";

const tx = (date: string, amount: number, pfc_primary = "FOOD_AND_DRINK"): SpendingTransaction => ({
  date,
  amount,
  pfc_primary,
  merchant_name: "M",
  name: "M",
  pending: false,
});

const sep = { year: 2026, month: 8 };
const today = (day: number) => ({ year: 2026, month: 8, day });

describe("previousMonth", () => {
  it("wraps across a year boundary", () => {
    expect(previousMonth({ year: 2026, month: 0 })).toEqual({ year: 2025, month: 11 });
    expect(previousMonth(sep)).toEqual({ year: 2026, month: 7 });
  });
});

describe("dailyCumulative", () => {
  it("accumulates net spend by day and is flat on empty days", () => {
    const c = dailyCumulative([tx("2026-09-02", 10), tx("2026-09-02", 5), tx("2026-09-04", 20), tx("2026-08-31", 999)], sep);
    expect(c).toHaveLength(30);
    expect(c.slice(0, 5)).toEqual([0, 15, 15, 35, 35]);
    expect(c[29]).toBe(35);
  });

  it("lets a refund reduce the running total", () => {
    expect(dailyCumulative([tx("2026-09-01", 50), tx("2026-09-03", -20)], sep)[2]).toBe(30);
  });
});

describe("paceComparison", () => {
  const data = [
    tx("2026-08-05", 100),
    tx("2026-08-20", 300), // last month: 100 by day 10, 400 by day 23
    tx("2026-08-29", 50),
    tx("2026-09-03", 80),
    tx("2026-09-10", 60),
  ];

  it("compares the in-progress month to last month at the same day", () => {
    const p = paceComparison(data, sep, today(23));
    expect(p.isCurrentMonth).toBe(true);
    expect(p.throughDay).toBe(23);
    expect(p.current).toBe(140);
    expect(p.previousSamePoint).toBe(400); // through Aug 23
    expect(p.previousTotal).toBe(450);
    expect(p.delta).toBe(-260);
    expect(p.deltaPct).toBeCloseTo(-0.65);
  });

  it("stops the current line at today but draws last month in full", () => {
    const p = paceComparison(data, sep, today(23));
    expect(p.series[22].current).toBe(140);
    expect(p.series[23].current).toBeNull();
    expect(p.series[30].previous).toBe(450); // day 31 exists only for August
    expect(p.series[30].current).toBeNull();
  });

  it("compares a finished month in full", () => {
    const p = paceComparison(data, { year: 2026, month: 7 }, today(23));
    expect(p.isCurrentMonth).toBe(false);
    expect(p.throughDay).toBe(31);
    expect(p.current).toBe(450);
    expect(p.hasPrevious).toBe(false); // nothing before August in this data
    expect(p.deltaPct).toBeNull();
  });

  it("does not treat months before the first transaction as zero-spend comparisons", () => {
    const p = paceComparison([tx("2026-09-03", 80)], sep, today(23));
    expect(p.hasPrevious).toBe(false);
    expect(p.series.every((s) => s.previous === null)).toBe(true);
  });
});

describe("categoryChanges", () => {
  const data = [
    tx("2026-08-10", 100, "FOOD_AND_DRINK"),
    tx("2026-09-10", 300, "FOOD_AND_DRINK"),
    tx("2026-08-11", 50, "TRAVEL"),
    tx("2026-09-12", 10, "MEDICAL"),
    tx("2026-08-12", 40, "ENTERTAINMENT"),
    tx("2026-09-13", 40, "ENTERTAINMENT"),
  ];

  it("orders by dollar change, keeps new and dropped categories, hides unchanged ones", () => {
    const rows = categoryChanges(data, sep);
    expect(rows.map((r) => r.category)).toEqual(["FOOD_AND_DRINK", "TRAVEL", "MEDICAL"]);
    expect(rows[0]).toMatchObject({ current: 300, previous: 100, delta: 200 });
    expect(rows[0].deltaPct).toBeCloseTo(2);
    expect(rows[1]).toMatchObject({ current: 0, previous: 50, delta: -50 });
    expect(rows[2]).toMatchObject({ previous: 0, deltaPct: null }); // brand new
  });
});

describe("typicalMonth", () => {
  it("averages the previous full months from the first month with data", () => {
    const data = [tx("2026-06-05", 100), tx("2026-07-05", 200), tx("2026-08-05", 300), tx("2026-09-05", 9999)];
    expect(typicalMonth(data, sep)).toBe(200);
    expect(typicalMonth([tx("2026-08-05", 90), tx("2026-09-05", 1)], sep)).toBe(90);
    expect(typicalMonth([tx("2026-09-05", 1)], sep)).toBeNull();
    expect(typicalMonth([], sep)).toBeNull();
  });
});

describe("dailyAverage", () => {
  // August (31 days): $310 spent. September so far, through day 20: $200.
  const data = [tx("2026-08-10", 310), tx("2026-09-05", 120), tx("2026-09-15", 80)];

  it("is the month's spend per elapsed day, against last month's full-month average", () => {
    const pace = paceComparison(data, sep, today(20));
    const d = dailyAverage(pace, sep);
    expect(d.current).toBeCloseTo(10); // 200 / 20
    expect(d.previous).toBeCloseTo(10); // 310 / 31
    expect(d.deltaPct).toBeCloseTo(0);
  });

  it("projects the month total from the current pace once past the first few days", () => {
    const pace = paceComparison(data, sep, today(20));
    expect(dailyAverage(pace, sep).projectedMonthTotal).toBeCloseTo(300); // $10/day x 30 days
    expect(dailyAverage(paceComparison(data, sep, today(3)), sep).projectedMonthTotal).toBeNull();
  });

  it("has no projection for a finished month, and averages it over its own length", () => {
    const pace = paceComparison(data, { year: 2026, month: 7 }, today(20));
    const d = dailyAverage(pace, { year: 2026, month: 7 });
    expect(d.projectedMonthTotal).toBeNull();
    expect(d.current).toBeCloseTo(10); // 310 / 31
    expect(d.previous).toBeNull(); // nothing before August in this data
  });

  it("reports the change against last month as a fraction", () => {
    const pace = paceComparison([tx("2026-08-10", 310), tx("2026-09-05", 300)], sep, today(20));
    expect(dailyAverage(pace, sep).deltaPct).toBeCloseTo(0.5); // $15/day vs $10/day
  });
});
