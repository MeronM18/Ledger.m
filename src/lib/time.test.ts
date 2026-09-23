import { describe, expect, it } from "vitest";
import { calendarNow, easternToday } from "@/lib/time";

describe("calendarNow", () => {
  it("uses the Eastern calendar day, not UTC, late in the evening", () => {
    // 2026-09-24 02:30 UTC is still Sep 23, 10:30 PM in Eastern.
    const c = calendarNow(new Date("2026-09-24T02:30:00Z"));
    expect(c.isoDate).toBe("2026-09-23");
    expect(c.month).toBe(8);
    expect(c.monthLabel).toBe("September 2026");
  });

  it("does not flip the month until Eastern midnight", () => {
    // 2026-10-01 01:00 UTC is still Sep 30, 9 PM Eastern.
    expect(calendarNow(new Date("2026-10-01T01:00:00Z")).month).toBe(8);
    // 2026-10-01 05:00 UTC is Oct 1, 1 AM Eastern.
    expect(calendarNow(new Date("2026-10-01T05:00:00Z")).month).toBe(9);
  });
});

describe("easternToday", () => {
  it("returns local midnight of the Eastern date", () => {
    const d = easternToday(new Date("2026-09-24T02:30:00Z"));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 23]);
  });
});
