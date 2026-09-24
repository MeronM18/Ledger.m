import { describe, expect, it } from "vitest";
import { transactionIconColor, transactionIconName, type IconTransaction } from "@/lib/transaction-icons";

const t = (o: Partial<IconTransaction>): IconTransaction => ({ name: null, merchant_name: "Shop", amount: 10, pfc_primary: null, ...o });

describe("transactionIconName", () => {
  it("uses Plaid's detailed category when it has an icon for it", () => {
    expect(transactionIconName(t({ pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_COFFEE" }))).toBe("Coffee");
    expect(transactionIconName(t({ pfc_primary: "TRANSPORTATION", pfc_detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" }))).toBe("CarTaxiFront");
    expect(transactionIconName(t({ pfc_primary: "TRAVEL", pfc_detailed: "TRAVEL_FLIGHTS" }))).toBe("Plane");
  });

  it("falls back to the main category", () => {
    expect(transactionIconName(t({ pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_RESTAURANT" }))).toBe("UtensilsCrossed");
    expect(transactionIconName(t({ pfc_primary: "GENERAL_SERVICES" }))).toBe("Wrench");
    expect(transactionIconName(t({ pfc_primary: null }))).toBe("Store");
  });

  it("shows card payments and transfers as money moving, including Chase's mislabeled payments", () => {
    expect(transactionIconName(t({ pfc_primary: "LOAN_PAYMENTS", merchant_name: "Chase Credit Card" }))).toBe("CreditCard");
    expect(transactionIconName(t({ pfc_primary: "LOAN_DISBURSEMENTS", merchant_name: null, name: "Payment Thank You-Mobile", amount: -785.41 }))).toBe("CreditCard");
    expect(transactionIconName(t({ pfc_primary: "TRANSFER_IN", amount: -789.11 }))).toBe("ArrowDownLeft");
    expect(transactionIconName(t({ pfc_primary: "TRANSFER_OUT" }))).toBe("ArrowUpRight");
  });

  it("goes by a category you picked, not Plaid's detail for the old one", () => {
    expect(transactionIconName(t({ pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_COFFEE", category_override: "ENTERTAINMENT" }))).toBe("Clapperboard");
  });

  it("reads a manual entry's name for the few clear cases", () => {
    expect(transactionIconName(t({ merchant_name: "Levelz Barber Shop", pfc_primary: "PERSONAL_CARE" }))).toBe("Scissors");
    expect(transactionIconName(t({ merchant_name: "Farmers market", pfc_primary: "FOOD_AND_DRINK" }))).toBe("UtensilsCrossed");
  });
});

describe("transactionIconColor", () => {
  it("gives each category one color, whatever its icon", () => {
    const coffee = t({ pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_COFFEE" });
    const groceries = t({ pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_GROCERIES" });
    expect(transactionIconColor(coffee)).toBe("var(--cat-food)");
    expect(transactionIconColor(groceries)).toBe("var(--cat-food)");
    expect(transactionIconColor(t({ pfc_primary: "INCOME" }))).toBe("var(--cat-income)");
  });

  it("colors money moving between your own accounts alike, and follows a category you picked", () => {
    expect(transactionIconColor(t({ pfc_primary: "LOAN_PAYMENTS" }))).toBe("var(--cat-money-movement)");
    expect(transactionIconColor(t({ pfc_primary: "TRANSFER_IN" }))).toBe("var(--cat-money-movement)");
    expect(transactionIconColor(t({ pfc_primary: "FOOD_AND_DRINK", category_override: "TRAVEL" }))).toBe("var(--cat-travel)");
    expect(transactionIconColor(t({ pfc_primary: null }))).toBe("var(--cat-other)");
  });

  it("has a color defined for every one it uses", async () => {
    const css = (await import("node:fs")).readFileSync("src/app/globals.css", "utf8");
    const categories = ["FOOD_AND_DRINK", "GENERAL_MERCHANDISE", "TRANSPORTATION", "TRAVEL", "ENTERTAINMENT", "PERSONAL_CARE", "MEDICAL", "BANK_FEES", "GENERAL_SERVICES", "GOVERNMENT_AND_NON_PROFIT", "RENT_AND_UTILITIES", "HOME_IMPROVEMENT", "INCOME", "TRANSFER", "OTHER"];
    for (const c of categories) {
      const token = transactionIconColor(t({ pfc_primary: c })).slice(4, -1);
      expect(css, token).toContain(`${token}:`);
    }
  });
});

describe("chart colors", () => {
  it("draw each category in its icon's color", async () => {
    const { categoryColorSlot } = await import("@/lib/plaid-categories");
    const css = (await import("node:fs")).readFileSync("src/app/globals.css", "utf8");
    const categories = ["FOOD_AND_DRINK", "GENERAL_MERCHANDISE", "TRANSPORTATION", "ENTERTAINMENT", "PERSONAL_CARE", "GENERAL_SERVICES", "BANK_FEES", "OTHER", "RENT_AND_UTILITIES", "TRAVEL", "MEDICAL", "HOME_IMPROVEMENT", "GOVERNMENT_AND_NON_PROFIT"];
    for (const c of categories) {
      const slot = categoryColorSlot(c);
      expect(css, c).toContain(`--viz-${slot}: ${transactionIconColor(t({ pfc_primary: c }))};`);
    }
  });
});
