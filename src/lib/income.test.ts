import { describe, expect, it } from "vitest";
import { incomeDeposits, incomeStats, variabilityOf } from "@/lib/income";
import type { SpendingTransaction } from "@/lib/spending-aggregation";

const tx = (o: Partial<SpendingTransaction>): SpendingTransaction => ({
  date: "2026-09-10",
  amount: 10,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: null,
  name: "CAFE",
  pending: false,
  ...o,
});
const pay = (date: string, amount: number) =>
  tx({ date, amount: -amount, pfc_primary: "INCOME", name: "UNITED MORTGAGE PAYROLL 123" });
const spend = (date: string, amount: number) => tx({ date, amount });

describe("incomeDeposits", () => {
  it("picks out settled income and names the paycheck", () => {
    const deposits = incomeDeposits([
      pay("2026-09-15", 3000),
      tx({ date: "2026-09-16", amount: -3000, pfc_primary: "INCOME", name: "UNITED MORTGAGE PAYROLL 1", pending: true }),
      spend("2026-09-17", 50),
      tx({ date: "2026-09-30", amount: -40, pfc_primary: "INCOME", pfc_detailed: "INCOME_INTEREST_EARNED", name: "INTEREST PAYMENT" }),
    ]);
    expect(deposits.map((d) => [d.date, d.amount, d.kind])).toEqual([
      ["2026-09-30", 40, "interest"],
      ["2026-09-15", 3000, "paycheck"],
    ]);
    expect(deposits[1].source).toContain("United Mortgage");
  });
});

describe("variabilityOf", () => {
  it("bands the spread against the average", () => {
    expect(variabilityOf(100, 1000)).toBe("steady");
    expect(variabilityOf(250, 1000)).toBe("uneven");
    expect(variabilityOf(500, 1000)).toBe("very uneven");
  });
});

describe("incomeStats", () => {
  // History from mid-March, so March is partial and left out.
  const all = [
    spend("2026-03-20", 100),
    pay("2026-04-15", 2000),
    pay("2026-04-30", 1000),
    spend("2026-04-10", 2500),
    pay("2026-05-15", 6000),
    spend("2026-05-10", 2000),
    pay("2026-06-15", 4000),
    spend("2026-06-10", 2000),
    pay("2026-09-15", 1500),
    spend("2026-09-05", 400),
  ];
  const spending = all.filter((t) => t.amount > 0);
  const stats = incomeStats(all, spending, "2026-09-20");

  it("counts only fully covered months, keeping empty ones as $0", () => {
    expect(stats.months.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(stats.completeMonths).toBe(5);
    expect(stats.thisMonth).toMatchObject({ month: "2026-09", income: 1500, complete: false });
  });

  it("works out the average, lowest, highest and median over complete months", () => {
    expect(stats.average).toBe((3000 + 6000 + 4000) / 5);
    expect(stats.lowest?.month).toBe("2026-07");
    expect(stats.highest).toMatchObject({ month: "2026-05", income: 6000 });
    expect(stats.median).toBe(3000);
    expect(stats.variability).toBe("very uneven");
  });

  it("tracks spending against income", () => {
    expect(stats.averageSpending).toBe(6500 / 5);
    expect(stats.savingsRate).toBeCloseTo((13000 - 6500) / 13000);
    expect(stats.monthsSpendingOverIncome).toBe(0);
    expect(stats.months[0].net).toBe(500);
  });

  it("totals the year so far, and skips last year when history doesn't reach it", () => {
    expect(stats.ytd).toBe(14500);
    expect(stats.ytdSpending).toBe(7000);
    expect(stats.ytdLastYear).toBeNull();
  });

  it("describes paychecks", () => {
    expect(stats.paychecks.count).toBe(5);
    expect(stats.paychecks.largest?.amount).toBe(6000);
    expect(stats.paychecks.last?.date).toBe("2026-09-15");
    expect(stats.paychecks.daysSinceLast).toBe(5);
    expect(stats.sources[0]).toMatchObject({ kind: "paycheck", count: 5, amount: 14500 });
  });

  it("compares with the same stretch of last year when history covers it", () => {
    const withLastYear = incomeStats([pay("2025-01-01", 10), pay("2025-02-01", 500), pay("2025-12-01", 900), ...all], spending, "2026-09-20");
    expect(withLastYear.ytdLastYear).toBe(510);
  });
});
