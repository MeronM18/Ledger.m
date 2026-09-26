import { describe, expect, it } from "vitest";
import { spendingActivity, upcomingBills, usualOf, whereItWent } from "@/lib/overview";

describe("the rest of the overview", () => {
  it("lists bills and card payments due in the next two weeks, soonest first, and never income", () => {
    const events = [
      { date: "2026-10-09", name: "Spectrum", amount: 79.99, kind: "bill" as const },
      { date: "2026-09-25", name: "Freedom Flex payment", amount: 842.13, kind: "card" as const },
      { date: "2026-10-10", name: "Too far", amount: 5, kind: "bill" as const },
      { date: "2026-09-30", name: "Paycheck", amount: 3000, kind: "income" as const },
      { date: "2026-09-24", name: "Yesterday", amount: 5, kind: "bill" as const },
    ];
    const due = upcomingBills(events, "2026-09-25", 14);
    expect(due.items.map((e) => e.name)).toEqual(["Freedom Flex payment", "Spectrum"]);
    expect(due.total).toBe(922.12);
  });

  it("gives the biggest categories their share, and sums the rest", () => {
    const categories = [
      { category: "RENT_AND_UTILITIES", label: "Rent & Utilities", amount: 2000, colorSlot: 9 },
      { category: "FOOD_AND_DRINK", label: "Food & Drink", amount: 1000, colorSlot: 1 },
      { category: "TRAVEL", label: "Travel", amount: -200, colorSlot: 10 }, // a refund month: left out
      { category: "MEDICAL", label: "Medical", amount: 600, colorSlot: 11 },
      { category: "OTHER", label: "Other", amount: 400, colorSlot: 8 },
    ];
    const { top, rest } = whereItWent(categories, 2);
    expect(top.map((c) => [c.category, c.share])).toEqual([
      ["RENT_AND_UTILITIES", 0.5],
      ["FOOD_AND_DRINK", 0.25],
    ]);
    expect(rest).toEqual({ count: 2, amount: 1000 });
  });

});

describe("spendingActivity", () => {
  const tx = (date: string, amount: number) => ({ date, amount, pfc_primary: "FOOD_AND_DRINK", merchant_name: "X", name: "X", pending: false });
  // Friday, Sep 25, 2026.
  const today = "2026-09-25";
  const spending = [tx("2026-09-25", 20), tx("2026-09-24", 10), tx("2026-09-24", -4), tx("2026-09-20", 50), tx("2026-09-13", 30), tx("2026-08-10", 100), tx("2026-09-19", -80)];

  it("totals the last seven days, today last", () => {
    const { day } = spendingActivity(spending, today);
    expect(day.map((d) => d.label)).toEqual(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(day.at(-1)).toMatchObject({ key: "2026-09-25", amount: 20, current: true });
    expect(day.at(-2)!.amount).toBe(6);
    // A day of refunds is an empty day.
    expect(day[0]).toMatchObject({ key: "2026-09-19", amount: 0 });
  });

  it("totals weeks Sunday to Saturday and months, each ending on the one in progress", () => {
    const { week, month } = spendingActivity(spending, today);
    expect(week.at(-1)).toMatchObject({ key: "2026-09-20", label: "Sep 20", amount: 76, current: true });
    expect(week.at(-2)).toMatchObject({ key: "2026-09-13", amount: 0 });
    expect(month.map((m) => m.label)).toEqual(["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(month.at(-1)!.amount).toBe(26);
    expect(month.at(-2)!.amount).toBe(100);
  });

  it("gives the usual as the average of the bars before the current one", () => {
    expect(usualOf([{ key: "a", label: "", amount: 10, current: false }, { key: "b", label: "", amount: 30, current: false }, { key: "c", label: "", amount: 99, current: true }])).toBe(20);
    expect(usualOf([{ key: "c", label: "", amount: 99, current: true }])).toBeNull();
  });
});
