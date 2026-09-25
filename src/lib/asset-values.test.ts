import { describe, expect, it } from "vitest";
import { effectiveValues, resolveAssetValues, shifted, valueOn, valueSeries, withValue } from "@/lib/asset-values";

const truck = [
  { date: "2026-03-01", value: 30000 },
  { date: "2026-09-24", value: 26000 },
];

describe("resolveAssetValues", () => {
  it("keeps well-formed points, oldest first, one a day, and drops the rest", () => {
    expect(
      resolveAssetValues({
        a: [
          { date: "2026-09-24", value: 26000 },
          { date: "2026-03-01", value: 30000 },
          { date: "2026-03-01", value: 31000 },
          { date: "bad", value: 1 },
          { date: "2026-01-01", value: "x" },
        ],
        b: "junk",
        c: [],
      })
    ).toEqual({ a: [{ date: "2026-03-01", value: 31000 }, { date: "2026-09-24", value: 26000 }] });
    expect(resolveAssetValues(null)).toEqual({});
  });
});

describe("valueOn", () => {
  it("is the latest value on or before the day, and nothing before the first", () => {
    expect(valueOn(truck, "2026-02-28")).toBeNull();
    expect(valueOn(truck, "2026-03-01")).toBe(30000);
    expect(valueOn(truck, "2026-09-23")).toBe(30000);
    expect(valueOn(truck, "2026-12-01")).toBe(26000);
  });
});

describe("withValue", () => {
  it("adds a value on a day, or replaces that day's, and skips one that changes nothing", () => {
    expect(withValue(truck, "2026-06-01", 28000).map((p) => p.date)).toEqual(["2026-03-01", "2026-06-01", "2026-09-24"]);
    expect(withValue(truck, "2026-09-24", 25500).at(-1)).toEqual({ date: "2026-09-24", value: 25500 });
    expect(withValue(truck, "2026-05-01", 30000)).toBe(truck);
    // An earlier start.
    expect(withValue(truck, "2025-01-01", 30000)[0]).toEqual({ date: "2025-01-01", value: 30000 });
  });
});

describe("shifted", () => {
  const cash = [{ date: "2026-09-19", value: 62823 }];

  it("moves every value from the day on by the amount, like $40 of cash spent on the 21st", () => {
    expect(shifted(cash, "2026-09-21", -40)).toEqual([
      { date: "2026-09-19", value: 62823 },
      { date: "2026-09-21", value: 62783 },
    ]);
  });

  it("doesn't reach back before the asset was entered", () => {
    expect(shifted(cash, "2026-09-01", -40)).toEqual([{ date: "2026-09-19", value: 62783 }]);
  });

  it("moves later values too", () => {
    const later = [...cash, { date: "2026-09-23", value: 63000 }];
    expect(shifted(later, "2026-09-20", 100)).toEqual([
      { date: "2026-09-19", value: 62823 },
      { date: "2026-09-20", value: 62923 },
      { date: "2026-09-23", value: 63100 },
    ]);
  });
});

describe("effectiveValues", () => {
  it("counts an asset with no history from the day it was added, at its value now", () => {
    expect(effectiveValues(undefined, "2026-09-24", 26000, "2026-09-24")).toEqual([{ date: "2026-09-24", value: 26000 }]);
  });

  it("adds a change made without a record, from the day it was made", () => {
    expect(effectiveValues(truck, "2026-03-01", 25000, "2026-10-02")).toEqual([...truck, { date: "2026-10-02", value: 25000 }]);
    expect(effectiveValues(truck, "2026-03-01", 26000, "2026-10-02")).toBe(truck);
  });
});

describe("valueSeries", () => {
  it("is nothing before the first value, then each day's value", () => {
    expect(valueSeries(truck, "2026-02-27", "2026-03-02")).toEqual([0, 0, 30000, 30000]);
    expect(valueSeries(truck, "2026-09-23", "2026-09-25")).toEqual([30000, 26000, 26000]);
  });
});
