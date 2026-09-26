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
    const [d] = detectRecurring(monthly("Apple Services", 2.99), "2026-06-20");
    expect(d).toMatchObject({ name: "Apple Services", amount: 2.99, amountVaries: false, frequency: "MONTHLY", occurrences: 6, lastDate: "2026-06-06", nextDate: "2026-07-06", active: true, restarted: false });
  });

  it("finds a bill whose amount changes each month", () => {
    const varying = [1.9, 5.08, 8.26, 5.08, 1.9, 2.11].map((amount, i) => ({ ...monthly("Hp *instant Ink", 0)[i], amount, category: "GENERAL_SERVICES" }));
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

describe("detectRecurring across accounts", () => {
  // Amazon Prime as it really went: a $1.05 trial on checking, $7.94 on
  // checking, a trial refunded on Freedom Flex, a $15.89 month on Apple Card,
  // then $7.94 on the 13th from July, the last one on Sapphire Preferred.
  const prime = [
    { date: "2024-12-23", amount: 1.05, accountName: "Checking" },
    { date: "2025-02-28", amount: 7.94, accountName: "Checking" },
    { date: "2025-10-07", amount: 7.94, accountName: "Freedom Flex" },
    { date: "2025-10-07", amount: 1.05, accountName: "Freedom Flex" },
    { date: "2025-10-08", amount: -1.05, accountName: "Freedom Flex" },
    { date: "2025-12-15", amount: 15.89, accountName: "Apple Card" },
    { date: "2026-07-13", amount: 7.94, accountName: "Apple Card" },
    { date: "2026-08-13", amount: 7.94, accountName: "Apple Card" },
    { date: "2026-09-13", amount: 7.94, accountName: "Sapphire Preferred", accountId: "sapphire" },
  ].map((c) => ({ ...c, name: "Amazon Prime", category: "GENERAL_MERCHANDISE" }));

  it("finds a subscription that was cancelled, restarted and moved cards, from its latest run", () => {
    const found = detectRecurring(prime, "2026-09-25");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      name: "Amazon Prime",
      amount: 7.94,
      frequency: "MONTHLY",
      occurrences: 3,
      firstDate: "2026-07-13",
      lastDate: "2026-09-13",
      nextDate: "2026-10-13",
      accountId: "sapphire",
      accountName: "Sapphire Preferred",
      active: true,
      restarted: true,
    });
  });

  it("takes two charges a month apart as enough for a known subscription service", () => {
    const [d] = detectRecurring(prime.slice(-2), "2026-09-25");
    expect(d).toMatchObject({ name: "Amazon Prime", occurrences: 2, active: true });
    // But not for any merchant.
    expect(detectRecurring(prime.slice(-2).map((c) => ({ ...c, name: "Corner Shop" })), "2026-09-25")).toEqual([]);
  });

  it("says a run that stopped charging isn't active", () => {
    const [d] = detectRecurring(prime, "2027-01-10");
    expect(d.active).toBe(false);
  });

  it("follows a price increase inside a run", () => {
    const netflix = [...monthly("Netflix", 15.49, "2026-01-12", 4), ...monthly("Netflix", 17.99, "2026-05-12", 3)];
    const [d] = detectRecurring(netflix, "2026-07-20");
    expect(d).toMatchObject({ amount: 17.99, occurrences: 7, previousAmount: 15.49 });
  });

  it("leaves groceries, gas and rides out, however regular", () => {
    const kroger = Array.from({ length: 20 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 2 + i * 7)).toISOString().slice(0, 10), name: "Kroger", amount: 80, category: "FOOD_AND_DRINK" }));
    const uber = monthly("Uber", 16.33).map((c) => ({ ...c, category: "TRANSPORTATION" }));
    expect(detectRecurring([...kroger, ...uber], "2026-06-20")).toEqual([]);
  });

  it("never takes transfers or income", () => {
    expect(detectRecurring(monthly("Savings", 200).map((c) => ({ ...c, category: "TRANSFER_OUT" })), "2026-06-20")).toEqual([]);
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
