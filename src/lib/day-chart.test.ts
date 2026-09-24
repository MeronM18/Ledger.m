import { describe, expect, it } from "vitest";
import { dateTicks, dayPoints, formatTickMoney, valueTicks } from "@/lib/day-chart";

const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("dayPoints", () => {
  it("puts each value on its own day, even across a year", () => {
    const points = dayPoints([1, 2, 3], "2025-12-31");
    expect(points.map((p) => p.date)).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"]);
    expect(points[1]).toEqual({ t: t("2026-01-01"), date: "2026-01-01", value: 2 });
  });

  it("gives the same day in two different years two different places", () => {
    // What a label like "May 17" can't do.
    const points = dayPoints(new Array(731).fill(0), "2024-09-24");
    const may17 = points.filter((p) => p.date.endsWith("-05-17"));
    expect(may17.map((p) => p.date)).toEqual(["2025-05-17", "2026-05-17"]);
    expect(may17[0].t).not.toBe(may17[1].t);
  });
});

describe("valueTicks", () => {
  it("steps in round amounts that bracket the line", () => {
    // The net worth line that was labeled $70K, $77K, $84K, $91K, $98K.
    expect(valueTicks(70_512.4, 96_204.11)).toEqual([70_000, 75_000, 80_000, 85_000, 90_000, 95_000, 100_000]);
  });

  it("brackets every value", () => {
    for (const [lo, hi] of [
      [72_489.48, 80_726.92],
      [-1_250.5, 3_400],
      [0.5, 9.75],
      [1_234_567, 1_290_000],
    ]) {
      const ticks = valueTicks(lo, hi);
      expect(ticks[0]).toBeLessThanOrEqual(lo);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(hi);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(9);
    }
  });

  it("spaces ticks evenly", () => {
    const ticks = valueTicks(72_489.48, 80_726.92);
    const gaps = new Set(ticks.slice(1).map((v, i) => v - ticks[i]));
    expect(gaps.size).toBe(1);
  });

  it("gives a flat line room above and below", () => {
    const ticks = valueTicks(80_000, 80_000);
    expect(ticks[0]).toBeLessThan(80_000);
    expect(ticks.at(-1)).toBeGreaterThan(80_000);
  });
});

describe("formatTickMoney", () => {
  it("writes thousands short", () => {
    expect(formatTickMoney(75_000, 5_000)).toBe("$75K");
    expect(formatTickMoney(72_500, 2_500)).toBe("$72.5K");
  });

  it("keeps the decimals the step needs, so neighbors never read the same", () => {
    expect(formatTickMoney(80_250, 250)).toBe("$80.25K");
    expect(formatTickMoney(80_500, 250)).toBe("$80.5K");
  });

  it("handles small and negative amounts", () => {
    expect(formatTickMoney(500, 250)).toBe("$500");
    expect(formatTickMoney(-2_000, 1_000)).toBe("-$2K");
    expect(formatTickMoney(1_500_000, 500_000)).toBe("$1.5M");
  });
});

describe("dateTicks", () => {
  it("marks a two-year line every quarter, with the year", () => {
    const { ticks, label } = dateTicks(t("2024-09-24"), t("2026-09-24"));
    expect(ticks.map(label)).toEqual([
      "Oct 2024",
      "Jan 2025",
      "Apr 2025",
      "Jul 2025",
      "Oct 2025",
      "Jan 2026",
      "Apr 2026",
      "Jul 2026",
    ]);
  });

  it("never labels two ticks the same", () => {
    for (const days of [7, 30, 91, 182, 365, 730]) {
      const to = t("2026-09-24");
      const { ticks, label } = dateTicks(to - days * 86_400_000, to);
      const labels = ticks.map(label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(8);
    }
  });

  it("marks a month on Mondays", () => {
    const { ticks, label } = dateTicks(t("2026-08-25"), t("2026-09-24"));
    expect(ticks.map((x) => new Date(x).getUTCDay())).toEqual(new Array(ticks.length).fill(1));
    expect(ticks.map(label)).toEqual(["Aug 31", "Sep 7", "Sep 14", "Sep 21"]);
  });

  it("marks three months on the 1st and 15th", () => {
    const { ticks, label } = dateTicks(t("2026-06-25"), t("2026-09-24"));
    expect(ticks.map(label)).toEqual(["Jul 1", "Jul 15", "Aug 1", "Aug 15", "Sep 1", "Sep 15"]);
  });

  it("keeps every tick inside the line", () => {
    const from = t("2025-03-10");
    const to = t("2026-03-10");
    const { ticks } = dateTicks(from, to);
    expect(ticks.every((x) => x >= from && x <= to)).toBe(true);
  });
});
