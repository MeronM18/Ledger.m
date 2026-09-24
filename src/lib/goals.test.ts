import { describe, expect, it } from "vitest";
import { goalProgress, goalsSummary, monthsUntil, type GoalInput } from "@/lib/goals";

const today = "2026-09-23";
const goal = (o: Partial<GoalInput> = {}): GoalInput => ({
  id: "g",
  name: "Emergency fund",
  target_amount: 1000,
  saved_amount: 250,
  target_date: null,
  account_refs: [],
  ...o,
});

describe("monthsUntil", () => {
  it("counts a partial month as a month, with a minimum of one", () => {
    expect(monthsUntil(today, "2026-10-23")).toBe(1);
    expect(monthsUntil(today, "2026-10-24")).toBe(2);
    expect(monthsUntil(today, "2027-09-23")).toBe(12);
    expect(monthsUntil(today, "2026-09-23")).toBe(1); // due today: still one month's worth
    expect(monthsUntil(today, "2026-09-30")).toBe(1);
  });

  it("returns null once the date has passed", () => {
    expect(monthsUntil(today, "2026-09-22")).toBeNull();
  });
});

describe("goalProgress", () => {
  it("computes saved, remaining and percent", () => {
    expect(goalProgress(goal(), today)).toMatchObject({
      saved: 250,
      remaining: 750,
      percent: 0.25,
      status: "no-date",
      neededPerMonth: null,
      tracksAccount: false,
    });
  });

  it("works out what to set aside per month to finish on time", () => {
    const p = goalProgress(goal({ target_date: "2027-03-23" }), today);
    expect(p.monthsLeft).toBe(6);
    expect(p.neededPerMonth).toBeCloseTo(125);
    expect(p.status).toBe("on-track");
  });

  it("is complete at or over the target, capped at 100%, with nothing needed", () => {
    const p = goalProgress(goal({ saved_amount: 1200, target_date: "2027-03-23" }), today);
    expect(p).toMatchObject({ status: "complete", percent: 1, remaining: 0, neededPerMonth: null });
  });

  it("is behind when the date passed and it isn't done", () => {
    const p = goalProgress(goal({ target_date: "2026-08-01" }), today);
    expect(p.status).toBe("behind");
    expect(p.monthsLeft).toBeNull();
    expect(p.neededPerMonth).toBeNull();
  });

  it("follows a linked account's balance instead of the manual amount", () => {
    const balances = new Map([["plaid:acct", 640]]);
    const p = goalProgress(goal({ account_refs: ["plaid:acct"] }), today, balances);
    expect(p).toMatchObject({ saved: 640, remaining: 360, tracksAccount: true });
  });

  it("falls back to the manual amount when the linked account's balance is unknown", () => {
    const p = goalProgress(goal({ account_refs: ["plaid:gone"] }), today, new Map());
    expect(p).toMatchObject({ saved: 250, tracksAccount: false });
  });

  it("never reports negative savings", () => {
    expect(goalProgress(goal({ account_refs: ["plaid:a"] }), today, new Map([["plaid:a", -50]])).saved).toBe(0);
  });
});

describe("goals that follow several accounts", () => {
  const balances = new Map([
    ["plaid:amex", 8159.71],
    ["manual:apple", 410.52],
  ]);

  it("adds the balances of every followed account, across connected and manual", () => {
    const p = goalProgress(goal({ target_amount: 15000, account_refs: ["plaid:amex", "manual:apple"] }), today, balances);
    expect(p.saved).toBeCloseTo(8570.23);
    expect(p.tracksAccount).toBe(true);
    expect(p.remaining).toBeCloseTo(6429.77);
  });

  it("counts only the accounts whose balance is known", () => {
    const p = goalProgress(goal({ account_refs: ["plaid:amex", "manual:not-entered"] }), today, balances);
    expect(p.saved).toBeCloseTo(8159.71);
  });

  it("falls back to the manual amount when none of the followed accounts is known", () => {
    const p = goalProgress(goal({ account_refs: ["manual:not-entered"] }), today, balances);
    expect(p).toMatchObject({ saved: 250, tracksAccount: false });
  });
});

describe("goalsSummary", () => {
  it("totals saved (capped at each target), targets, and completed goals", () => {
    const s = goalsSummary([
      goalProgress(goal({ id: "1", saved_amount: 1500 }), today),
      goalProgress(goal({ id: "2", target_amount: 500, saved_amount: 100 }), today),
    ]);
    expect(s).toEqual({ saved: 1100, target: 1500, completed: 1 });
  });
});
