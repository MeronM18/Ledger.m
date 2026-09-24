import { describe, expect, it } from "vitest";
import { costShares, daysUntil, dueLabel, monthOutlook, nextCharges, type RecurringCharge } from "@/lib/recurring-board";

const item = (o: Partial<RecurringCharge>): RecurringCharge => ({
  key: "k",
  name: "Netflix",
  amount: 15.49,
  frequency: "MONTHLY",
  lastDate: null,
  nextDate: null,
  ...o,
});

describe("daysUntil / dueLabel", () => {
  it("counts whole days", () => {
    expect(daysUntil("2026-09-24", "2026-09-24")).toBe(0);
    expect(daysUntil("2026-10-01", "2026-09-24")).toBe(7);
    expect(dueLabel("2026-09-24", "2026-09-24")).toBe("Today");
    expect(dueLabel("2026-09-25", "2026-09-24")).toBe("Tomorrow");
    expect(dueLabel("2026-09-30", "2026-09-24")).toBe("In 6 days");
    expect(dueLabel("2026-09-20", "2026-09-24")).toBe("4 days ago");
  });
});

describe("monthOutlook", () => {
  it("splits a bank stream into charged and still to come", () => {
    const out = monthOutlook(
      [
        item({ key: "a", name: "Spectrum", amount: 79.99, lastDate: "2026-09-09", nextDate: "2026-10-09" }),
        item({ key: "b", name: "Gym", amount: 19.99, lastDate: "2026-08-28", nextDate: "2026-09-28" }),
      ],
      "2026-09-24"
    );
    expect(out.paid.map((c) => [c.name, c.date])).toEqual([["Spectrum", "2026-09-09"]]);
    expect(out.upcoming.map((c) => [c.name, c.date])).toEqual([["Gym", "2026-09-28"]]);
    expect(out.paidTotal).toBeCloseTo(79.99);
    expect(out.upcomingTotal).toBeCloseTo(19.99);
  });

  it("counts every weekly charge this month", () => {
    const out = monthOutlook([item({ frequency: "WEEKLY", amount: 5, lastDate: "2026-09-22", nextDate: "2026-09-29" })], "2026-09-24");
    expect(out.paid.map((c) => c.date)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
    expect(out.upcoming.map((c) => c.date)).toEqual(["2026-09-29"]);
  });

  it("doesn't count a charge that landed today twice", () => {
    const out = monthOutlook([item({ lastDate: "2026-09-24", nextDate: "2026-09-24" })], "2026-09-24");
    expect(out.paid).toHaveLength(1);
    expect(out.upcoming).toHaveLength(0);
  });

  it("works out a manual entry's last charge from its schedule", () => {
    // Next due Oct 23: the one before was Sep 23, already this month.
    const ahead = monthOutlook([item({ nextDate: "2026-10-23" })], "2026-09-24");
    expect(ahead.paid.map((c) => c.date)).toEqual(["2026-09-23"]);
    expect(ahead.upcoming).toHaveLength(0);
    // A stale stored date rolls forward: Jul 3 → Sep 3 charged, Oct 3 next.
    const stale = monthOutlook([item({ nextDate: "2026-09-03" })], "2026-09-24");
    expect(stale.paid.map((c) => c.date)).toEqual(["2026-09-03"]);
  });

  it("expects nothing more from a lapsed subscription", () => {
    const out = monthOutlook([item({ lastDate: "2026-06-10", nextDate: "2026-07-10" })], "2026-09-24");
    expect(out.upcoming).toHaveLength(0);
    expect(out.paid).toHaveLength(0);
  });
});

describe("nextCharges", () => {
  it("lists each subscription's next charge, soonest first", () => {
    const list = nextCharges(
      [
        item({ key: "a", name: "Spectrum", nextDate: "2026-10-09" }),
        item({ key: "b", name: "Gym", nextDate: "2026-09-28" }),
        item({ key: "c", name: "Old", nextDate: "2026-05-01", lastDate: "2026-04-01" }),
      ],
      "2026-09-24"
    );
    expect(list.map((c) => [c.name, c.date])).toEqual([
      ["Gym", "2026-09-28"],
      ["Spectrum", "2026-10-09"],
    ]);
  });
});

describe("costShares", () => {
  it("ranks by monthly cost and folds the tail", () => {
    const shares = costShares(
      [
        item({ key: "a", name: "A", amount: 60 }),
        item({ key: "b", name: "B", amount: 120, frequency: "ANNUALLY" }),
        item({ key: "c", name: "C", amount: 20 }),
        item({ key: "d", name: "D", amount: 10 }),
      ],
      2
    );
    expect(shares.map((s) => s.name)).toEqual(["A", "C", "2 more"]);
    expect(shares[2].monthly).toBeCloseTo(20);
    expect(shares.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });

  it("doesn't fold a single leftover", () => {
    expect(costShares([item({ key: "a", amount: 5 }), item({ key: "b", amount: 3 })], 1).map((s) => s.key)).toEqual(["a", "b"]);
  });
});
