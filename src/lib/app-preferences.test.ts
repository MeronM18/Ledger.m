import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, maskTopic, resolveAlertThresholds, resolveDisplayName } from "@/lib/app-preferences";
import { DISPLAY_NAME } from "@/lib/config";

describe("resolveAlertThresholds", () => {
  it("falls back to the defaults", () => {
    expect(resolveAlertThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(resolveAlertThresholds("nope")).toEqual(DEFAULT_THRESHOLDS);
  });

  it("keeps values in range and drops the rest", () => {
    expect(resolveAlertThresholds({ largeCharge: 500, lowBalance: 0, renewalDaysAhead: 7 })).toEqual({
      largeCharge: 500,
      lowBalance: 0,
      renewalDaysAhead: 7,
    });
    const bad = resolveAlertThresholds({ largeCharge: -5, lowBalance: "100", renewalDaysAhead: 90 });
    expect(bad).toEqual(DEFAULT_THRESHOLDS);
  });

  it("rounds days to whole days and money to cents", () => {
    expect(resolveAlertThresholds({ renewalDaysAhead: 4.6, largeCharge: 99.999 })).toMatchObject({ renewalDaysAhead: 5, largeCharge: 100 });
  });
});

describe("resolveDisplayName", () => {
  it("uses yours when set", () => {
    expect(resolveDisplayName("  Meron ")).toBe("Meron");
  });
  it("falls back when blank or missing", () => {
    expect(resolveDisplayName("   ")).toBe(DISPLAY_NAME);
    expect(resolveDisplayName(undefined)).toBe(DISPLAY_NAME);
  });
});

describe("maskTopic", () => {
  it("shows only the start", () => {
    expect(maskTopic("ledger-secret-topic")).toBe("led••••••••");
    expect(maskTopic("abc")).toBe("•••");
  });
});
