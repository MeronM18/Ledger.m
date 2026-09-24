import { describe, expect, it } from "vitest";
import { bankSigninAlerts, unusualChargeAlerts } from "@/lib/alerts-logic";
import { highUtilizationAlerts } from "@/lib/alerts-logic";
import { monthlySummary, monthlySummaryAlert } from "@/lib/monthly-summary";
import type { SpendingTransaction } from "@/lib/spending-aggregation";

let n = 0;
const charge = (date: string, amount: number, merchant = "Kroger", o: Partial<SpendingTransaction> = {}) => ({
  id: `t${++n}`,
  date,
  amount,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: merchant,
  name: null,
  pending: false,
  ...o,
});

describe("unusualChargeAlerts", () => {
  const history = [charge("2026-08-01", 100), charge("2026-08-08", 120), charge("2026-08-15", 90), charge("2026-08-22", 110)];

  it("flags a recent charge far above the merchant's usual", () => {
    const big = charge("2026-09-22", 486.2);
    const alerts = unusualChargeAlerts([...history, big], "2026-09-23", "USD");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: `unusual-charge:${big.id}`, kind: "unusual-charge", title: "Unusual charge at Kroger" });
    expect(alerts[0].body).toContain("$486.20");
    expect(alerts[0].body).toContain("$105.00");
  });

  it("ignores ordinary charges, old ones, pending ones and thin history", () => {
    expect(unusualChargeAlerts([...history, charge("2026-09-22", 140)], "2026-09-23", "USD")).toHaveLength(0);
    expect(unusualChargeAlerts([...history, charge("2026-09-10", 486)], "2026-09-23", "USD")).toHaveLength(0);
    expect(unusualChargeAlerts([...history, charge("2026-09-22", 486, "Kroger", { pending: true })], "2026-09-23", "USD")).toHaveLength(0);
    expect(unusualChargeAlerts([history[0], history[1], charge("2026-09-22", 486)], "2026-09-23", "USD")).toHaveLength(0);
  });

  it("needs a real dollar jump, not just a big ratio on a small charge", () => {
    const coffee = [charge("2026-08-01", 5, "Cafe"), charge("2026-08-02", 5, "Cafe"), charge("2026-08-03", 6, "Cafe")];
    expect(unusualChargeAlerts([...coffee, charge("2026-09-22", 30, "Cafe")], "2026-09-23", "USD")).toHaveLength(0);
  });
});

describe("bankSigninAlerts", () => {
  it("repeats at most weekly per bank", () => {
    const [mon] = bankSigninAlerts([{ id: "b", name: "Fifth Third" }], "2026-09-21");
    const [wed] = bankSigninAlerts([{ id: "b", name: "Fifth Third" }], "2026-09-23");
    expect(mon.key).toBe(wed.key);
    expect(mon.title).toBe("Sign in to Fifth Third again");
  });
});

describe("monthlySummary", () => {
  const all = [
    { date: "2026-08-15", amount: -5000, pfc_primary: "INCOME", merchant_name: null, name: "ACME PAYROLL 1", pending: false },
    charge("2026-08-10", 700),
    charge("2026-08-12", 300, "Shell", { pfc_primary: "TRANSPORTATION" }),
    charge("2026-09-02", 50),
  ];
  const spending = all.filter((t) => t.amount > 0);
  const budgets = [
    { id: "1", category: "FOOD_AND_DRINK", monthly_amount: 600 },
    { id: "2", category: "TRANSPORTATION", monthly_amount: 400 },
  ];
  const snaps = [
    { date: "2026-07-31", net_worth: 10000 },
    { date: "2026-08-31", net_worth: 13500 },
  ];

  it("summarizes last month", () => {
    const s = monthlySummary(all, spending, budgets, snaps, "2026-09-01");
    expect(s).toMatchObject({ month: "2026-08", monthName: "August", income: 5000, spending: 1000, kept: 4000, netWorthChange: 3500 });
    expect(s?.budgetsOver).toEqual([{ label: "Food & Drink", over: 100 }]);

    const alert = monthlySummaryAlert(s!, "USD");
    expect(alert).toMatchObject({ key: "monthly-summary:2026-08", title: "August in review" });
    expect(alert.body).toContain("Kept $4,000.00");
    expect(alert.body).toContain("Net worth +$3,500.00, now $13,500.00");
    expect(alert.body).toContain("Budgets: 1 of 2 within; over: Food & Drink by $100.00");
  });

  it("rolls back over the new year, and says nothing about a month with no history", () => {
    expect(monthlySummary(all, spending, budgets, snaps, "2027-01-02")).toBeNull();
    const dec = [{ ...charge("2026-12-05", 20) }];
    expect(monthlySummary(dec, dec, [], [], "2027-01-02")?.month).toBe("2026-12");
  });
});

describe("highUtilizationAlerts", () => {
  const card = (utilization: number) => ({
    id: "c1",
    label: "Sapphire Preferred ••4657",
    balance: 8000 * utilization,
    limit: 8000,
    utilization,
    band: "fair" as const,
    payDownToGood: Math.max(0, 8000 * utilization - 2400),
    payDownToExcellent: 0,
  });

  it("says nothing under 30%", () => {
    expect(highUtilizationAlerts([card(0.29)], "2026-09", "USD")).toEqual([]);
  });

  it("names the card, the share used, and what to pay to get under 30%", () => {
    const [a] = highUtilizationAlerts([card(0.34)], "2026-09", "USD");
    expect(a).toMatchObject({
      kind: "high-utilization",
      key: "high-utilization:c1:2026-09:30",
      title: "Sapphire Preferred ••4657 is at 34% of its limit",
      body: "$2,720.00 of $8,000.00 used. Paying $320.00 brings it under 30%.",
    });
  });

  it("alerts again at 50%, once a month at each level", () => {
    expect(highUtilizationAlerts([card(0.55)], "2026-09", "USD")[0].key).toBe("high-utilization:c1:2026-09:50");
    expect(highUtilizationAlerts([card(0.55)], "2026-10", "USD")[0].key).toBe("high-utilization:c1:2026-10:50");
  });
});
