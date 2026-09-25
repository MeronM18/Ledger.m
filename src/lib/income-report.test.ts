import { describe, expect, it } from "vitest";
import { incomeReport, NO_FILTERS, previousRange, runningTotals, type IncomeEntry } from "@/lib/income-report";
import { periodRange } from "@/lib/spending-report";

const TODAY = "2026-09-24";
let seq = 0;
const e = (date: string, amount: number, source = "United Mortgage Paycheck", kind: IncomeEntry["kind"] = "paycheck", accountId = "chk"): IncomeEntry => ({
  id: `e${++seq}`,
  date,
  amount,
  source,
  kind,
  accountId,
});

const entries = [
  e("2025-08-15", 3000),
  e("2025-09-15", 3500),
  e("2025-09-20", 400, "Zelle from Sam", "other"),
  e("2026-07-15", 5000),
  e("2026-07-31", 40, "Amex Interest", "interest", "sav"),
  e("2026-08-15", 2000),
  e("2026-08-31", 45, "Amex Interest", "interest", "sav"),
  e("2026-09-15", 6000),
  e("2026-09-18", 250, "Zelle from Sam", "other"),
];
const spending = [
  { date: "2026-08-10", amount: 2500 },
  { date: "2026-09-02", amount: 1800 },
  { date: "2026-09-30", amount: 999 }, // not yet
];

describe("previousRange", () => {
  it("compares a month in progress with the same days of the month before", () => {
    expect(previousRange(periodRange("this-month", TODAY), TODAY)).toEqual({ start: "2026-08-01", end: "2026-08-24" });
  });

  it("compares the year so far with the same stretch last year, and a full month with the full one before", () => {
    expect(previousRange(periodRange("this-year", TODAY), TODAY)).toEqual({ start: "2025-01-01", end: "2025-09-24" });
    expect(previousRange(periodRange("2026-03", TODAY), TODAY)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousRange(periodRange("last-12-months", TODAY), TODAY)).toEqual({ start: "2024-10-01", end: "2025-09-24" });
    expect(previousRange(periodRange("all", TODAY), TODAY)).toBeNull();
  });
});

describe("incomeReport", () => {
  it("totals the period, by kind, against the stretch before, with spending and what was kept", () => {
    const r = incomeReport(entries, spending, periodRange("last-3-months", TODAY), NO_FILTERS, TODAY);
    expect(r.total).toBe(13335);
    expect(r.count).toBe(6);
    expect(r.byKind).toEqual({ paycheck: 13000, interest: 85, other: 250 });
    // Apr 1 - Jun 24: nothing came in.
    expect(r.previous).toEqual({ range: { start: "2026-04-01", end: "2026-06-24" }, total: 0 });
    expect(r.spending).toBe(4300);
    expect(r.kept).toBe(9035);
  });

  it("draws the period's months, each split by kind, with its best and slowest complete months", () => {
    const r = incomeReport(entries, spending, periodRange("last-3-months", TODAY), NO_FILTERS, TODAY);
    expect(r.months.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(r.months[1]).toMatchObject({ paycheck: 2000, interest: 45, other: 0, income: 2045, spending: 2500, kept: -455, complete: true });
    expect(r.months[2].complete).toBe(false);
    expect(r.best?.month).toBe("2026-07");
    expect(r.slowest?.month).toBe("2026-08");
    expect(r.averageMonth).toBe((5040 + 2045) / 2);
    expect(r.highlight).toBe("2026-09");
  });

  it("narrows everything to a kind, a source or an account, and drops spending then", () => {
    const interest = incomeReport(entries, spending, periodRange("last-3-months", TODAY), { ...NO_FILTERS, kind: "interest" }, TODAY);
    expect(interest.total).toBe(85);
    expect(interest.sources.map((s) => s.source)).toEqual(["Amex Interest"]);
    expect(interest.spending).toBeNull();
    expect(interest.months[0]).toMatchObject({ income: 40, spending: null, kept: null });

    const zelle = incomeReport(entries, spending, periodRange("all", TODAY), { ...NO_FILTERS, source: "Zelle from Sam" }, TODAY);
    expect(zelle.total).toBe(650);
    const savings = incomeReport(entries, spending, periodRange("all", TODAY), { ...NO_FILTERS, accountId: "sav" }, TODAY);
    expect(savings.total).toBe(85);
  });

  it("ranks sources with their share, and sizes up the paychecks", () => {
    const r = incomeReport(entries, spending, periodRange("this-year", TODAY), NO_FILTERS, TODAY);
    expect(r.sources[0]).toMatchObject({ source: "United Mortgage Paycheck", amount: 13000, count: 3 });
    expect(r.sources[0].share).toBeCloseTo(13000 / 13335, 6);
    expect(r.paychecks).toMatchObject({ count: 3, largest: { amount: 6000 }, smallest: { amount: 2000 } });
    expect(r.paychecks.average).toBeCloseTo(13000 / 3, 2);
    expect(r.paychecks.typicalGapDays).toBe(31);
    expect(r.entries[0].date).toBe("2026-09-18");
  });

  it("compares the year so far with the same stretch last year", () => {
    const r = incomeReport(entries, spending, periodRange("this-year", TODAY), NO_FILTERS, TODAY);
    // Jan 1 - Sep 24, 2025: Aug 15, Sep 15 and Sep 20.
    expect(r.previous?.total).toBe(6900);
  });
});

describe("runningTotals", () => {
  it("adds this year up month by month beside last year, stopping this year at this month", () => {
    const run = runningTotals(entries, NO_FILTERS, TODAY)!;
    expect(run).toHaveLength(12);
    expect(run[7]).toEqual({ month: 8, thisYear: 7085, lastYear: 3000 });
    expect(run[8]).toEqual({ month: 9, thisYear: 13335, lastYear: 6900 });
    expect(run[9]).toEqual({ month: 10, thisYear: null, lastYear: 6900 });
  });

  it("is nothing without a last year to compare with", () => {
    expect(runningTotals(entries.filter((x) => x.date >= "2026-01-01"), NO_FILTERS, TODAY)).toBeNull();
  });
});
