import { describe, expect, it } from "vitest";
import {
  hasLapsed,
  hasPriceIncrease,
  isWithinNextDays,
  projectNextOccurrence,
  summarizeSubscriptions,
} from "@/lib/subscriptions-aggregation";

const today = new Date(2026, 8, 23); // Sep 23, 2026

describe("projectNextOccurrence", () => {
  it("rolls a monthly date that passed yesterday to next month", () => {
    expect(projectNextOccurrence("2026-09-22", "MONTHLY", today)).toBe("2026-10-22");
  });

  it("leaves a future date untouched, and today counts as upcoming", () => {
    expect(projectNextOccurrence("2026-09-28", "MONTHLY", today)).toBe("2026-09-28");
    expect(projectNextOccurrence("2026-09-23", "MONTHLY", today)).toBe("2026-09-23");
  });

  it("rolls several periods when the stored date is far behind", () => {
    expect(projectNextOccurrence("2026-06-05", "MONTHLY", today)).toBe("2026-10-05");
  });

  it("clamps to the end of a shorter month without drifting", () => {
    expect(projectNextOccurrence("2026-01-31", "MONTHLY", new Date(2026, 1, 10))).toBe("2026-02-28");
    // ...and returns to the 31st when the month allows it.
    expect(projectNextOccurrence("2026-01-31", "MONTHLY", new Date(2026, 2, 1))).toBe("2026-03-28");
  });

  it("steps weekly, biweekly and annual cadences", () => {
    expect(projectNextOccurrence("2026-09-01", "WEEKLY", today)).toBe("2026-09-29");
    expect(projectNextOccurrence("2026-09-01", "BIWEEKLY", today)).toBe("2026-09-29");
    expect(projectNextOccurrence("2025-08-02", "ANNUALLY", today)).toBe("2027-08-02");
  });

  it("returns null with no date", () => {
    expect(projectNextOccurrence(null, "MONTHLY", today)).toBeNull();
  });
});

describe("hasLapsed / isWithinNextDays", () => {
  it("only flags a lapse past the 10-day grace window", () => {
    expect(hasLapsed("2026-09-13", today)).toBe(false);
    expect(hasLapsed("2026-09-12", today)).toBe(true);
    expect(hasLapsed(null, today)).toBe(false);
  });

  it("windows are inclusive of today and the last day", () => {
    expect(isWithinNextDays("2026-09-23", 14, today)).toBe(true);
    expect(isWithinNextDays("2026-10-07", 14, today)).toBe(true);
    expect(isWithinNextDays("2026-10-08", 14, today)).toBe(false);
    expect(isWithinNextDays("2026-09-22", 14, today)).toBe(false);
  });
});

describe("hasPriceIncrease", () => {
  it("flags more than 10% above average only", () => {
    expect(hasPriceIncrease(9.99, 12.99)).toBe(true);
    expect(hasPriceIncrease(9.99, 10.49)).toBe(false);
    expect(hasPriceIncrease(null, 12)).toBe(false);
  });
});

describe("summarizeSubscriptions", () => {
  it("normalizes each cadence to a monthly cost and excludes cancelled", () => {
    const r = summarizeSubscriptions([
      { average_amount: 10, frequency: "MONTHLY", is_active: true, user_marked_cancelled: false },
      { average_amount: 120, frequency: "ANNUALLY", is_active: true, user_marked_cancelled: false },
      { average_amount: 99, frequency: "MONTHLY", is_active: true, user_marked_cancelled: true },
    ]);
    expect(r.active).toHaveLength(2);
    expect(r.inactive).toHaveLength(1);
    expect(r.monthlyTotal).toBeCloseTo(20);
    expect(r.annualTotal).toBeCloseTo(240);
  });
});
