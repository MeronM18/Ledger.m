import { describe, expect, it } from "vitest";
import { cadenceOf, detectRecurring, newDetections } from "@/lib/recurring-detection";

const monthly = (name: string, amount: number, start = "2026-01-06", n = 6) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    return { date: d.toISOString().slice(0, 10), name, amount };
  });

describe("cadenceOf", () => {
  it("recognizes monthly, weekly and yearly rhythms, tolerating a skipped or late one", () => {
    expect(cadenceOf(["2026-01-06", "2026-02-06", "2026-03-06", "2026-04-06"])).toBe("MONTHLY");
    expect(cadenceOf(["2026-01-06", "2026-02-06", "2026-03-06", "2026-05-06", "2026-06-06", "2026-07-06"])).toBe("MONTHLY");
    expect(cadenceOf(["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"])).toBe("WEEKLY");
    expect(cadenceOf(["2025-08-02", "2026-08-02"])).toBe("ANNUALLY");
  });

  it("rejects irregular gaps and too little history", () => {
    expect(cadenceOf(["2026-01-06", "2026-02-20", "2026-06-01"])).toBeNull();
    expect(cadenceOf(["2026-01-06", "2026-02-06"])).toBeNull(); // two charges a month apart isn't proof
    expect(cadenceOf(["2026-01-06"])).toBeNull();
  });
});

describe("detectRecurring", () => {
  it("finds a fixed-price monthly charge and predicts the next date", () => {
    const [d] = detectRecurring(monthly("Apple Services", 2.99));
    expect(d).toMatchObject({ name: "Apple Services", amount: 2.99, amountVaries: false, frequency: "MONTHLY", occurrences: 6, lastDate: "2026-06-06", nextDate: "2026-07-06" });
  });

  it("finds a bill whose amount changes each month", () => {
    const varying = [1.9, 5.08, 8.26, 5.08, 1.9, 2.11].map((amount, i) => ({ ...monthly("Hp *instant Ink", 0)[i], amount }));
    const [d] = detectRecurring(varying);
    expect(d).toMatchObject({ name: "Hp *instant Ink", amountVaries: true, frequency: "MONTHLY" });
    expect(d.amount).toBeCloseTo(3.59, 1); // median of the six
  });

  it("does not mistake a merchant with many unrelated purchases for a bill", () => {
    const restaurant = Array.from({ length: 12 }, (_, i) => ({ date: `2026-0${1 + (i % 6)}-${10 + i}`, name: "Antonios Place", amount: 10 + i * 3.7 }));
    expect(detectRecurring(restaurant)).toEqual([]);
  });

  it("keeps two subscriptions on the same descriptor apart by price", () => {
    const found = detectRecurring([...monthly("Apple Services", 2.99), ...monthly("Apple Services", 9.99)]);
    expect(found.map((d) => d.amount).sort()).toEqual([2.99, 9.99]);
  });

  it("ignores refunds and credits", () => {
    expect(detectRecurring(monthly("Refunded Thing", -5))).toEqual([]);
  });
});

describe("newDetections", () => {
  it("drops ones already tracked, by the same name matching duplicate detection uses", () => {
    const detected = detectRecurring([...monthly("Apple Services", 2.99), ...monthly("Spotify", 10.99)]);
    expect(newDetections(detected, ["apple services"]).map((d) => d.name)).toEqual(["Spotify"]);
    expect(newDetections(detected, ["SPOTIFY USA"]).map((d) => d.name)).toEqual(["Apple Services"]);
    expect(newDetections(detected, [])).toHaveLength(2);
  });
});
