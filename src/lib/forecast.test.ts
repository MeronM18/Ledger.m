import { describe, expect, it } from "vitest";
import { buildForecast, occurrencesBetween, typicalDailySpend, type RecurringItem } from "@/lib/forecast";
import type { SpendingTransaction } from "@/lib/spending-aggregation";

const today = new Date(2026, 8, 23); // Wed Sep 23, 2026
const plus = (days: number) => new Date(today.getTime() + days * 86_400_000);

const item = (o: Partial<RecurringItem> & { id: string }): RecurringItem => ({
  name: o.id,
  amount: 10,
  frequency: "MONTHLY",
  date: "2026-09-28",
  ...o,
});

const tx = (date: string, amount: number): SpendingTransaction => ({
  date,
  amount,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "M",
  name: "M",
  pending: false,
});

describe("occurrencesBetween", () => {
  it("repeats a weekly item through the window, inclusive of both ends", () => {
    expect(occurrencesBetween(item({ id: "w", frequency: "WEEKLY", date: "2026-09-24" }), today, plus(15))).toEqual([
      "2026-09-24",
      "2026-10-01",
      "2026-10-08",
    ]);
  });

  it("rolls a just-passed monthly date to next month, outside a short window", () => {
    expect(occurrencesBetween(item({ id: "m", date: "2026-09-22" }), today, plus(14))).toEqual([]);
    expect(occurrencesBetween(item({ id: "m", date: "2026-09-22" }), today, plus(30))).toEqual(["2026-10-22"]);
  });

  it("includes a charge dated today", () => {
    expect(occurrencesBetween(item({ id: "t", date: "2026-09-23" }), today, plus(3))).toEqual(["2026-09-23"]);
  });

  it("returns nothing for a lapsed or undated item", () => {
    expect(occurrencesBetween(item({ id: "l", date: "2026-08-01" }), today, plus(30))).toEqual([]);
    expect(occurrencesBetween(item({ id: "n", date: null }), today, plus(30))).toEqual([]);
  });
});

describe("buildForecast: safe to spend", () => {
  const base = {
    today,
    typicalDailySpend: null,
    lowBalanceThreshold: 100,
  };
  const paycheck = item({ id: "pay", name: "Acme Paycheck", amount: 2000, frequency: "BIWEEKLY", date: "2026-10-02" });

  it("is cash minus the bills due before the next paycheck", () => {
    const f = buildForecast({
      ...base,
      cash: 1000,
      income: [paycheck],
      bills: [item({ id: "rent", amount: 600, date: "2026-09-30" }), item({ id: "gym", amount: 20, date: "2026-10-05" })],
    });
    expect(f.nextIncome).toMatchObject({ date: "2026-10-02", amount: 2000 });
    expect(f.daysToPayday).toBe(9);
    expect(f.billsBeforePayday).toBe(600); // the gym charge is after payday
    expect(f.safeToSpend).toBe(400);
    expect(f.perDay).toBeCloseTo(400 / 9);
  });

  it("does not count a bill dated on payday itself as before payday", () => {
    const f = buildForecast({ ...base, cash: 500, income: [paycheck], bills: [item({ id: "b", amount: 100, date: "2026-10-02" })] });
    expect(f.billsBeforePayday).toBe(0);
  });

  it("can go negative when the bills outrun the cash", () => {
    const f = buildForecast({ ...base, cash: 100, income: [paycheck], bills: [item({ id: "rent", amount: 600, date: "2026-09-30" })] });
    expect(f.safeToSpend).toBe(-500);
  });

  it("falls back to a 14-day horizon when no paycheck is known", () => {
    const f = buildForecast({
      ...base,
      cash: 1000,
      income: [],
      bills: [item({ id: "a", amount: 50, date: "2026-09-30" }), item({ id: "b", amount: 70, date: "2026-10-20" })],
    });
    expect(f.nextIncome).toBeNull();
    expect(f.daysToPayday).toBe(14);
    expect(f.safeToSpend).toBe(950);
  });

  it("ignores an income dated today (it has likely already landed)", () => {
    const f = buildForecast({ ...base, cash: 500, bills: [], income: [item({ id: "p", amount: 900, frequency: "MONTHLY", date: "2026-09-23" })] });
    expect(f.nextIncome?.date).toBe("2026-10-23");
  });

  it("reports how far typical spending would overshoot what's safe", () => {
    const f = buildForecast({ ...base, cash: 400, income: [paycheck], bills: [], typicalDailySpend: 60 });
    // 9 days * $60 = $540 against $400 safe.
    expect(f.projectedShortfall).toBe(140);
  });
});

describe("buildForecast: balance line", () => {
  it("applies bills and paychecks on their dates, and the expected line also drains by typical spend", () => {
    const f = buildForecast({
      today,
      cash: 1000,
      income: [item({ id: "pay", amount: 500, frequency: "MONTHLY", date: "2026-09-26" })],
      bills: [item({ id: "b", amount: 200, date: "2026-09-25" })],
      typicalDailySpend: 10,
      lowBalanceThreshold: 100,
      horizonDays: 5,
    });
    expect(f.points).toHaveLength(6);
    expect(f.points[0]).toMatchObject({ date: "2026-09-23", committed: 1000, expected: 1000 });
    expect(f.points[2]).toMatchObject({ date: "2026-09-25", committed: 800, expected: 780 });
    expect(f.points[3]).toMatchObject({ date: "2026-09-26", committed: 1300, expected: 1270 });
  });

  it("finds the low point and the first day under the threshold", () => {
    const f = buildForecast({
      today,
      cash: 150,
      income: [],
      bills: [item({ id: "b", amount: 100, date: "2026-09-25" })],
      typicalDailySpend: 0,
      lowBalanceThreshold: 100,
      horizonDays: 7,
    });
    expect(f.lowPoint).toEqual({ date: "2026-09-25", balance: 50 });
    expect(f.firstBelowThreshold).toEqual({ date: "2026-09-25", balance: 50 });
  });

  it("reports no dip when the balance stays healthy", () => {
    const f = buildForecast({ today, cash: 5000, income: [], bills: [], typicalDailySpend: 5, lowBalanceThreshold: 100, horizonDays: 10 });
    expect(f.firstBelowThreshold).toBeNull();
  });
});

describe("typicalDailySpend", () => {
  const todayIso = "2026-09-23";

  it("is trailing spend minus the recurring bills, per day", () => {
    // History starts Aug 1 (>30 days), so a 30-day window. $900 spent in the window,
    // $300/month of bills -> $600 of other spending over 30 days = $20/day.
    const txs = [tx("2026-08-01", 100), tx("2026-09-05", 400), tx("2026-09-20", 500)];
    const bills = [item({ id: "rent", amount: 300, date: "2026-10-01" })];
    // Window is (Aug 24, Sep 23]: only the 400 + 500 count.
    expect(typicalDailySpend(txs, todayIso, bills)).toBeCloseTo(20);
  });

  it("never goes negative when bills exceed spending", () => {
    expect(typicalDailySpend([tx("2026-08-01", 5), tx("2026-09-20", 50)], todayIso, [item({ id: "b", amount: 500, date: "2026-10-01" })])).toBe(0);
  });

  it("returns null with under a week of history or none at all", () => {
    expect(typicalDailySpend([tx("2026-09-20", 50)], todayIso, [])).toBeNull();
    expect(typicalDailySpend([], todayIso, [])).toBeNull();
  });
});
