import { describe, expect, it } from "vitest";
import { attentionItems } from "@/lib/attention";
import type { BudgetProgress } from "@/lib/budgets";
import { netWorthTrend, sparklinePath } from "@/lib/net-worth-trend";

const today = "2026-09-23";

describe("netWorthTrend", () => {
  const snaps = [
    { date: "2026-08-10", net_worth: 1000 },
    { date: "2026-08-24", net_worth: 1200 }, // 30 days before Sep 23
    { date: "2026-09-10", net_worth: 1500 },
  ];

  it("measures change from the latest snapshot at least 30 days old", () => {
    const t = netWorthTrend(snaps, 1800, today);
    expect(t.change).toBe(600);
    expect(t.changePct).toBeCloseTo(0.5);
  });

  it("ends the line on today's live figure, replacing a same-day snapshot", () => {
    const t = netWorthTrend([...snaps, { date: today, net_worth: 1700 }], 1800, today);
    expect(t.values.at(-1)).toBe(1800);
    expect(t.values).toHaveLength(4);
  });

  it("with a young history, gives the change since the first snapshot and says from when", () => {
    const young = [{ date: "2026-09-10", net_worth: 1000 }];
    expect(netWorthTrend(young, 1100, today)).toMatchObject({ change: 100, since: "2026-09-10" });
    const days = [{ date: "2026-09-20", net_worth: 1000 }, { date: "2026-09-22", net_worth: 1050 }];
    expect(netWorthTrend(days, 1100, today)).toMatchObject({ change: 100, since: "2026-09-20" });
    // Only today's snapshot: nothing earlier to compare with.
    expect(netWorthTrend([{ date: today, net_worth: 1000 }], 1100, today).change).toBeNull();
    expect(netWorthTrend([], 1100, today)).toEqual({ change: null, changePct: null, since: null, values: [1100] });
  });

  it("says nothing about a start date once a full 30 days are covered", () => {
    expect(netWorthTrend([{ date: "2026-08-01", net_worth: 1000 }], 1100, today).since).toBeNull();
  });

  it("gives no percentage from a zero start, and handles a decline", () => {
    expect(netWorthTrend([{ date: "2026-08-01", net_worth: 0 }], 500, today).changePct).toBeNull();
    const down = netWorthTrend([{ date: "2026-08-01", net_worth: 1000 }], 700, today);
    expect(down.change).toBe(-300);
    expect(down.changePct).toBeCloseTo(-0.3);
  });

  it("keeps only about 90 days of points", () => {
    const old = [{ date: "2026-01-01", net_worth: 1 }, { date: "2026-09-01", net_worth: 2 }];
    expect(netWorthTrend(old, 3, today).values).toEqual([2, 3]);
  });
});

describe("sparklinePath", () => {
  it("returns null under two points", () => {
    expect(sparklinePath([5], 100, 20)).toBeNull();
    expect(sparklinePath([], 100, 20)).toBeNull();
  });

  it("runs low values to the bottom and high to the top, left to right", () => {
    expect(sparklinePath([0, 10], 100, 20, 0)).toBe("M0.0 20.0 L100.0 0.0");
  });

  it("draws a flat series as a centered line", () => {
    expect(sparklinePath([5, 5, 5], 100, 20, 0)).toBe("M0.0 10.0 L50.0 10.0 L100.0 10.0");
  });
});

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

describe("attentionItems", () => {
  it("lists over-budget first, then warnings, then near renewals", () => {
    const items = attentionItems(
      [
        progress({ category: "A", label: "A", status: "warning", percentUsed: 0.85, remaining: 15 }),
        progress({ category: "B", label: "B", status: "over", spent: 130, remaining: -30, percentUsed: 1.3 }),
        progress({ category: "C", label: "C", status: "ok" }),
      ],
      [
        { key: "n", label: "Netflix", amount: 15.49, date: "2026-09-24" },
        { key: "far", label: "Gym", amount: 20, date: "2026-10-05" },
        { key: "past", label: "Old", amount: 5, date: "2026-09-20" },
      ],
      today,
      "USD"
    );
    expect(items.map((i) => i.title)).toEqual([
      "B is over budget",
      "A budget is 85% used",
      "Netflix renews tomorrow",
    ]);
    expect(items[0].detail).toContain("$30.00 over");
    expect(items[2].href).toBe("/subscriptions");
  });

  it("lists every over-budget category on its own line, furthest over first", () => {
    const over = (n: string, remaining: number) =>
      progress({ category: n, label: n, status: "over", remaining, percentUsed: 1.5, budget: 100, spent: 100 - remaining });
    const items = attentionItems(
      [over("Small", -5), over("Huge", -400), over("Mid", -50), over("Tiny", -1), over("Big", -120)],
      [],
      today,
      "USD"
    );
    expect(items.map((i) => i.title)).toEqual([
      "Huge is over budget",
      "Big is over budget",
      "Mid is over budget",
      "Small is over budget",
      "Tiny is over budget",
    ]);
    expect(items[0].detail).toBe("$400.00 over your $100.00 budget");
  });

  it("keeps one or two of a kind as their own rows", () => {
    const over = (n: string) =>
      progress({ category: n, label: n, status: "over", remaining: -10, percentUsed: 1.1 });
    expect(attentionItems([over("A"), over("B")], [], today, "USD").map((i) => i.title)).toEqual([
      "A is over budget",
      "B is over budget",
    ]);
  });

  it("caps the total and is empty when nothing needs attention", () => {
    const renewals = Array.from({ length: 14 }, (_, i) => ({ key: `r${i}`, label: `R${i}`, amount: 5, date: "2026-09-24" }));
    expect(attentionItems([], renewals, today, "USD")).toHaveLength(10);
    expect(attentionItems([progress({})], [], today, "USD")).toEqual([]);
  });
});

describe("attentionItems with a disconnected bank", () => {
  it("puts the bank first", () => {
    const items = attentionItems([progress({ category: "B", label: "B", status: "over", remaining: -30 })], [], today, "USD", [
      { id: "x", name: "Fifth Third Bank" },
    ]);
    expect(items[0]).toMatchObject({ key: "reconnect-x", title: "Sign in to Fifth Third Bank again", href: "/accounts" });
    expect(items[1].key).toBe("over-B");
  });
});
