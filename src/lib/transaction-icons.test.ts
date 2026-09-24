import { describe, expect, it } from "vitest";
import { transactionIconName, type IconTransaction } from "@/lib/transaction-icons";

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
