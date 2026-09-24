import { describe, expect, it } from "vitest";
import { postedDate, purchaseDate } from "@/lib/transaction-dates";

describe("transaction dates", () => {
  it("goes by the day of the purchase, as the bank's app does", () => {
    // Dairy Queen, bought on the 22nd, posted on the 23rd.
    expect(purchaseDate({ date: "2026-09-23", authorized_date: "2026-09-22" })).toBe("2026-09-22");
  });

  it("uses the posted day when there's no purchase day (deposits, some pending rows)", () => {
    expect(purchaseDate({ date: "2026-09-23", authorized_date: null })).toBe("2026-09-23");
    expect(purchaseDate({ date: "2026-09-23" })).toBe("2026-09-23");
  });

  it("keeps the posted day for statement periods", () => {
    expect(postedDate({ date: "2026-09-22", posted_date: "2026-09-23" })).toBe("2026-09-23");
    expect(postedDate({ date: "2026-09-22" })).toBe("2026-09-22");
  });
});
