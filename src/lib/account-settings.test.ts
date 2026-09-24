import { describe, expect, it } from "vitest";
import { accountName, resolveAccountSettings } from "@/lib/account-settings";

describe("accountName", () => {
  it("uses your name first, then the product name for a generic bank name, then the bank's name", () => {
    expect(accountName({ name: "CREDIT CARD", official_name: "Chase Freedom Flex" }, { nickname: "Flex" })).toBe("Flex");
    expect(accountName({ name: "CREDIT CARD", official_name: "CHASE SAPPHIRE PREFERRED" })).toBe("Chase Sapphire Preferred");
    expect(accountName({ name: "Credit Card", official_name: null })).toBe("Credit Card");
    expect(accountName({ name: "FIFTH THIRD MOMENTUM CHECKING", official_name: "Momentum Checking" })).toBe("Fifth Third Momentum Checking");
  });
});

describe("resolveAccountSettings", () => {
  it("keeps valid days and names, drops the rest", () => {
    expect(resolveAccountSettings({ a: { nickname: " Flex ", statementCloseDay: 3, paymentDueDay: 40 }, b: "junk" })).toEqual({
      a: { nickname: "Flex", statementCloseDay: 3, paymentDueDay: null },
    });
    expect(resolveAccountSettings(null)).toEqual({});
  });
});
