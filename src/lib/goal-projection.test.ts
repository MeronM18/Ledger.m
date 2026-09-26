import { describe, expect, it } from "vitest";
import { addMonthsKey, projectGoal } from "@/lib/goal-projection";

// The screenshot's goal: $8,570 of $15,000 by Dec 31, on Sep 25.
const base = { saved: 8570, target: 15000, interestPerMonth: 0, todayIso: "2026-09-25", targetDate: "2026-12-31" };

describe("addMonthsKey", () => {
  it("rolls over years both ways", () => {
    expect(addMonthsKey("2026-11", 3)).toBe("2027-02");
    expect(addMonthsKey("2026-01", -1)).toBe("2025-12");
  });
});

describe("projectGoal", () => {
  it("counts this month as the first, so your date's month is column 4", () => {
    const p = projectGoal({ ...base, perMonth: 1400 });
    expect(p.dueIndex).toBe(4);
    expect(p.columns[4].month).toBe("2026-12");
    expect(p.columns[0]).toMatchObject({ month: null, total: 8570 });
    expect(p.atDue).toBe(8570 + 1400 * 4);
    expect(p.shortAtDue).toBe(15000 - 14170);
    // $6,430 left at $1,400 a month: five months, so January.
    expect(p).toMatchObject({ finishIndex: 5, finishMonth: "2027-01", monthsLate: 1, truncated: false });
  });

  it("counts a date early in a month without that month's saving", () => {
    const p = projectGoal({ ...base, perMonth: 1000, targetDate: "2027-02-02" });
    expect(p.dueIndex).toBe(5);
    expect(p.columns[5].month).toBe("2027-01");
  });

  it("is on time at the monthly amount the plan asks for", () => {
    const p = projectGoal({ ...base, perMonth: 6430 / 4 });
    expect(p).toMatchObject({ finishIndex: 4, monthsLate: 0, shortAtDue: 0 });
  });

  it("caps each month at the target and splits deposits from interest", () => {
    const p = projectGoal({ ...base, perMonth: 1000, interestPerMonth: 30 });
    expect(p.columns[1]).toMatchObject({ added: 1000, interest: 30, total: 9600 });
    const last = p.columns[p.finishIndex!];
    expect(last.total).toBe(15000);
    expect(last.added + last.interest + last.saved).toBeCloseTo(15000, 6);
    expect(last.reached).toBe(true);
  });

  it("draws at least six months, and at most the cap, saying when it's reached past it", () => {
    expect(projectGoal({ ...base, perMonth: 7000, targetDate: null }).columns).toHaveLength(7);
    const slow = projectGoal({ ...base, perMonth: 50, maxMonths: 36 });
    expect(slow.columns).toHaveLength(37);
    expect(slow).toMatchObject({ finishIndex: null, truncated: true, finishMonth: addMonthsKey("2026-09", Math.ceil(6430 / 50) - 1) });
  });

  it("never reaches it at nothing a month", () => {
    expect(projectGoal({ ...base, perMonth: 0 })).toMatchObject({ finishIndex: null, finishMonth: null, truncated: true, monthsLate: null });
  });

  it("leaves out a date that's passed", () => {
    expect(projectGoal({ ...base, perMonth: 1400, targetDate: "2026-08-31" })).toMatchObject({ dueIndex: null, atDue: null, monthsLate: null });
  });
});
