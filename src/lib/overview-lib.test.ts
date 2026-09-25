import { describe, expect, it } from "vitest";
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
