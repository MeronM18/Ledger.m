import { describe, expect, it } from "vitest";
import {
  cancelSearchUrl,
  effectiveNextDate,
  findDuplicates,
  findOverlaps,
  isNewSubscription,
  normalizeName,
  subscriptionInsights,
  trialStart,
  type InsightItem,
} from "@/lib/subscription-insights";

const item = (o: Partial<InsightItem> & { key: string; name: string }): InsightItem => ({
  source: "plaid",
  amount: 10,
  frequency: "MONTHLY",
  ...o,
});

describe("effectiveNextDate", () => {
  it("prefers Plaid's prediction", () => {
    expect(effectiveNextDate("2026-10-05", "2026-09-05", "MONTHLY")).toBe("2026-10-05");
  });

  it("derives an annual fee's next date from the last charge", () => {
    expect(effectiveNextDate(null, "2026-08-02", "ANNUALLY")).toBe("2027-08-02");
    expect(effectiveNextDate(null, "2026-09-01", "WEEKLY")).toBe("2026-09-08");
  });

  it("does not guess with an unknown cadence or no history", () => {
    expect(effectiveNextDate(null, "2026-08-02", "UNKNOWN")).toBeNull();
    expect(effectiveNextDate(null, "2026-08-02", null)).toBeNull();
    expect(effectiveNextDate(null, null, "MONTHLY")).toBeNull();
  });
});

describe("isNewSubscription", () => {
  it("is true for the first 45 days only", () => {
    expect(isNewSubscription("2026-09-01", "2026-09-23")).toBe(true);
    expect(isNewSubscription("2026-08-09", "2026-09-23")).toBe(true); // exactly 45 days
    expect(isNewSubscription("2026-08-08", "2026-09-23")).toBe(false);
    expect(isNewSubscription(null, "2026-09-23")).toBe(false);
  });
});

describe("trialStart", () => {
  it("flags a token first charge that grew into a real price", () => {
    expect(trialStart(0, 15.99)).toEqual({ firstAmount: 0 });
    expect(trialStart(1, 9.99)).toEqual({ firstAmount: 1 });
  });

  it("does not flag a normal start, a cheap subscription, or missing data", () => {
    expect(trialStart(9.99, 9.99)).toBeNull();
    expect(trialStart(0.5, 1.99)).toBeNull(); // cheap all along
    expect(trialStart(null, 9.99)).toBeNull();
  });
});

describe("normalizeName / cancelSearchUrl", () => {
  it("compares names ignoring case and punctuation", () => {
    expect(normalizeName("ChatGPT Plus")).toBe(normalizeName("CHATGPT-plus"));
  });

  it("builds an encoded search link", () => {
    expect(cancelSearchUrl("iCloud+")).toBe("https://www.google.com/search?q=how%20to%20cancel%20iCloud%2B%20subscription");
  });
});

describe("findDuplicates", () => {
  it("flags a bank-detected charge that is also entered manually", () => {
    const out = findDuplicates(
      [
        item({ key: "p1", name: "Netflix", amount: 15.49 }),
        item({ key: "m1", name: "netflix", source: "manual", amount: 15.49 }),
        item({ key: "p2", name: "Spotify" }),
      ],
      "USD"
    );
    expect(out).toHaveLength(1);
    expect(out[0].keys.sort()).toEqual(["m1", "p1"]);
    expect(out[0].detail).toContain("both from your bank and as a manual entry");
    expect(out[0].detail).toContain("$30.98");
  });

  it("matches a longer statement name that contains the service", () => {
    expect(findDuplicates([item({ key: "a", name: "Spotify" }), item({ key: "b", name: "SPOTIFY USA" })], "USD")).toHaveLength(1);
  });

  it("does not match short or unrelated names", () => {
    expect(findDuplicates([item({ key: "a", name: "HBO" }), item({ key: "b", name: "HBO Max" })], "USD")).toHaveLength(0);
    expect(findDuplicates([item({ key: "a", name: "Hulu" }), item({ key: "b", name: "Netflix" })], "USD")).toHaveLength(0);
  });

  it("merges a chain into one group", () => {
    const out = findDuplicates(
      [item({ key: "a", name: "Spotify" }), item({ key: "b", name: "Spotify Premium" }), item({ key: "c", name: "SPOTIFY PREMIUM FAMILY" })],
      "USD"
    );
    expect(out).toHaveLength(1);
    expect(out[0].keys).toHaveLength(3);
  });
});

describe("findOverlaps", () => {
  it("groups active subscriptions in the same Plaid category and totals them monthly", () => {
    const out = findOverlaps(
      [
        item({ key: "a", name: "Netflix", amount: 15.49, categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
        item({ key: "b", name: "Hulu", amount: 120, frequency: "ANNUALLY", categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
        item({ key: "c", name: "Spotify", categoryDetailed: "ENTERTAINMENT_MUSIC_AND_AUDIO" }),
      ],
      "USD"
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("2 video streaming subscriptions");
    expect(out[0].detail).toContain("$25.49 a month"); // 15.49 + 120/12
  });

  it("needs two, and ignores items with no category", () => {
    expect(findOverlaps([item({ key: "a", name: "Netflix", categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES" })], "USD")).toEqual([]);
    expect(findOverlaps([item({ key: "a", name: "X" }), item({ key: "b", name: "Y" })], "USD")).toEqual([]);
  });
});

describe("subscriptionInsights", () => {
  it("combines duplicates and overlaps", () => {
    const out = subscriptionInsights(
      [
        item({ key: "a", name: "Netflix", categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
        item({ key: "b", name: "Hulu", categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES" }),
        item({ key: "c", name: "Netflix", source: "manual" }),
      ],
      "USD"
    );
    expect(out.map((i) => i.kind).sort()).toEqual(["duplicate", "overlap"]);
  });
});
