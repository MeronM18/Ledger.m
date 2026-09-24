import { describe, expect, it } from "vitest";
import { isDisconnected, needsReconnect, statusLabel } from "@/lib/item-status";

describe("item status", () => {
  it("asks for a new sign-in when the bank logged out or is about to", () => {
    expect(needsReconnect({ status: "requires_reauth", error_code: "ITEM_LOGIN_REQUIRED" })).toBe(true);
    expect(needsReconnect({ status: "pending_expiration", error_code: null })).toBe(true);
    expect(needsReconnect({ status: "error", error_code: "ITEM_LOGIN_REQUIRED" })).toBe(true);
    expect(needsReconnect({ status: "active", error_code: null })).toBe(false);
    expect(needsReconnect({ status: "error", error_code: "INSTITUTION_DOWN" })).toBe(false);
  });

  it("only calls it disconnected once syncing has actually stopped", () => {
    expect(isDisconnected({ status: "pending_expiration", error_code: null })).toBe(false);
    expect(isDisconnected({ status: "requires_reauth", error_code: null })).toBe(true);
  });

  it("labels statuses in plain words", () => {
    expect(statusLabel({ status: "requires_reauth", error_code: null })).toBe("Sign-in needed");
    expect(statusLabel({ status: "active", error_code: null })).toBe("Connected");
    expect(statusLabel({ status: "pending_expiration", error_code: null })).toBe("Expires soon");
  });
});
