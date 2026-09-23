import { describe, expect, it } from "vitest";
import { ALL_PFC_CATEGORIES, categoryColorSlot, isSpendingCategory } from "@/lib/plaid-categories";

describe("categoryColorSlot", () => {
  it("gives every spending category its own slot", () => {
    const spending = ALL_PFC_CATEGORIES.filter((c) => isSpendingCategory(c));
    const slots = spending.map((c) => categoryColorSlot(c));
    expect(slots.every((s) => s !== null)).toBe(true);
    expect(new Set(slots).size).toBe(spending.length);
  });

  it("treats uncategorized as Other", () => {
    expect(categoryColorSlot(null)).toBe(categoryColorSlot("OTHER"));
  });
});
