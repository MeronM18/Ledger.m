import { describe, expect, it } from "vitest";
import {
  budgetAlerts,
  lowBalanceAlerts,
  priceIncreaseAlerts,
  renewalAlerts,
  weekStart,
  type RenewalCandidate,
} from "@/lib/alerts-logic";
import type { BudgetProgress } from "@/lib/budgets";
import { formatTransactionNotification, isLargeCharge } from "@/lib/plaid-notify-format";
import { timeAgo } from "@/lib/format";
import type { Transaction } from "plaid";

const today = new Date(2026, 8, 23); // Sep 23, 2026 (a Wednesday)

const progress = (o: Partial<BudgetProgress>): BudgetProgress => ({
  id: "b",
  category: "FOOD_AND_DRINK",
  label: "Food & Drink",
  colorSlot: 1,
  budget: 100,
  spent: 50,
  remaining: 50,
  percentUsed: 0.5,
  status: "ok",
  projected: null,
  projectedOver: false,
  ...o,
});

describe("budgetAlerts", () => {
  it("alerts once per category per month, separately for warning and over", () => {
    const alerts = budgetAlerts(
      [
        progress({ category: "A", label: "A", status: "over", spent: 120, remaining: -20, percentUsed: 1.2 }),
        progress({ category: "B", label: "B", status: "warning", spent: 85, remaining: 15, percentUsed: 0.85 }),
        progress({ category: "C", label: "C", status: "ok" }),
      ],
      "2026-09",
      "USD"
    );
    expect(alerts.map((a) => a.key)).toEqual(["budget-over:A:2026-09", "budget-warning:B:2026-09"]);
    expect(alerts[0].title).toBe("A is over budget");
    expect(alerts[1].title).toBe("B budget is 85% used");
    expect(alerts[1].body).toContain("$15.00 left");
  });

  it("alerts on the whole month against the monthly budget, before any category", () => {
    const month = { budget: 2500, spent: 2600, remaining: -100, percentUsed: 1.04, status: "over" as const, projected: null, projectedOver: false };
    const alerts = budgetAlerts([progress({ category: "A", label: "A", status: "over", spent: 120, remaining: -20, percentUsed: 1.2 })], "2026-09", "USD", month);
    expect(alerts.map((a) => a.key)).toEqual(["budget-over:MONTH:2026-09", "budget-over:A:2026-09"]);
    expect(alerts[0].title).toBe("You're over your monthly budget");
    const near = budgetAlerts([], "2026-09", "USD", { ...month, spent: 2100, remaining: 400, percentUsed: 0.84, status: "warning" });
    expect(near[0]).toMatchObject({ key: "budget-warning:MONTH:2026-09", title: "Monthly budget is 84% used" });
    expect(budgetAlerts([], "2026-09", "USD", { ...month, spent: 100, remaining: 2400, percentUsed: 0.04, status: "ok" })).toEqual([]);
  });

  it("uses a new key each month so a budget alerts again next month", () => {
    const over = [progress({ status: "over", spent: 120, remaining: -20, percentUsed: 1.2 })];
    expect(budgetAlerts(over, "2026-09", "USD")[0].key).not.toBe(budgetAlerts(over, "2026-10", "USD")[0].key);
  });
});

describe("renewalAlerts", () => {
  const sub = (o: Partial<RenewalCandidate>): RenewalCandidate => ({
    source: "manual",
    id: "s1",
    name: "iCloud+",
    amount: 9.99,
    frequency: "MONTHLY",
    date: "2026-09-25",
    ...o,
  });

  it("alerts for a renewal inside the window, with a friendly time", () => {
    const [a] = renewalAlerts([sub({})], today, 3, "USD");
    expect(a.title).toBe("iCloud+ renews in 2 days");
    expect(a.key).toBe("renewal:manual:s1:2026-09-25");
    expect(renewalAlerts([sub({ date: "2026-09-24" })], today, 3, "USD")[0].title).toBe("iCloud+ renews tomorrow");
    expect(renewalAlerts([sub({ date: "2026-09-23" })], today, 3, "USD")[0].title).toBe("iCloud+ renews today");
  });

  it("stays quiet outside the window", () => {
    expect(renewalAlerts([sub({ date: "2026-09-28" })], today, 3, "USD")).toEqual([]);
  });

  it("rolls a just-passed date forward instead of missing it", () => {
    // Stored Sep 22 (yesterday), monthly -> next is Oct 22, outside the window.
    expect(renewalAlerts([sub({ date: "2026-09-22" })], today, 3, "USD")).toEqual([]);
  });

  it("skips a subscription that has lapsed", () => {
    expect(renewalAlerts([sub({ date: "2026-08-01" })], today, 3, "USD")).toEqual([]);
  });

  it("has a different key for each billing cycle", () => {
    expect(renewalAlerts([sub({ date: "2026-09-25" })], today, 3, "USD")[0].key).not.toBe(
      renewalAlerts([sub({ date: "2026-08-25" })], new Date(2026, 7, 23), 3, "USD")[0].key
    );
  });
});

describe("priceIncreaseAlerts", () => {
  it("flags more than 10% over average, once per new charge amount", () => {
    const [a] = priceIncreaseAlerts([{ id: "n", name: "Netflix", average_amount: 15.49, last_amount: 17.99 }], "USD");
    expect(a.key).toBe("price-increase:n:17.99");
    expect(a.body).toContain("$17.99");
    expect(priceIncreaseAlerts([{ id: "n", name: "Netflix", average_amount: 15.49, last_amount: 15.99 }], "USD")).toEqual([]);
  });
});

describe("lowBalanceAlerts", () => {
  const acct = (o: Partial<Parameters<typeof lowBalanceAlerts>[0][number]>) => ({
    id: "a1",
    name: "Checking",
    mask: "3230",
    type: "depository",
    available_balance: 42,
    current_balance: 60,
    ...o,
  });

  it("uses available balance, falling back to current", () => {
    expect(lowBalanceAlerts([acct({})], "2026-09-23", 100, "USD")[0].body).toContain("$42.00");
    expect(lowBalanceAlerts([acct({ available_balance: null })], "2026-09-23", 100, "USD")[0].body).toContain("$60.00");
  });

  it("ignores credit cards and healthy balances, and nags at most weekly", () => {
    expect(lowBalanceAlerts([acct({ type: "credit" })], "2026-09-23", 100, "USD")).toEqual([]);
    expect(lowBalanceAlerts([acct({ available_balance: 500 })], "2026-09-23", 100, "USD")).toEqual([]);
    const wed = lowBalanceAlerts([acct({})], "2026-09-23", 100, "USD")[0].key;
    const fri = lowBalanceAlerts([acct({})], "2026-09-25", 100, "USD")[0].key;
    const nextWeek = lowBalanceAlerts([acct({})], "2026-09-30", 100, "USD")[0].key;
    expect(wed).toBe(fri);
    expect(wed).not.toBe(nextWeek);
  });
});

describe("weekStart", () => {
  it("returns the Monday, including across a month boundary", () => {
    expect(weekStart("2026-09-23")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday belongs to the week before Monday
    expect(weekStart("2026-10-01")).toBe("2026-09-28");
  });
});

describe("large charge push label", () => {
  const t = (amount: number) =>
    ({
      amount,
      name: "BEST BUY",
      merchant_name: "Best Buy",
      pending: false,
      iso_currency_code: "USD",
    }) as unknown as Transaction;

  it("labels a debit at or above the threshold, never a deposit", () => {
    expect(isLargeCharge(t(250))).toBe(true);
    expect(isLargeCharge(t(249.99))).toBe(false);
    expect(isLargeCharge(t(-5000))).toBe(false);
    expect(formatTransactionNotification(t(400), "Checking ••3230").subtitle).toBe("Large charge: $400.00 at Best Buy");
    expect(formatTransactionNotification(t(40), "Checking ••3230").subtitle).toBe("$40.00 at Best Buy");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  it("scales from seconds to a date", () => {
    expect(timeAgo("2026-09-23T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-09-23T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-09-23T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-09-21T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-09-01T12:00:00Z", now)).toBe("Sep 1");
  });
});
