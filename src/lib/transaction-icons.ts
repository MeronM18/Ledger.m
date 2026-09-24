import { effectiveCategory, type DisplayableTransaction } from "@/lib/transaction-display";

// Pure. The icon a transaction shows when the bank sent no logo: from
// Plaid's detailed category when there is one (coffee, groceries, gas),
// otherwise its main category. Names come back as strings so the mapping
// can be tested without React; transaction-avatar.tsx turns them into icons.

export type TransactionIconName =
  | "ArrowDownLeft"
  | "ArrowLeftRight"
  | "ArrowUpRight"
  | "Banknote"
  | "BedDouble"
  | "Beer"
  | "BookOpen"
  | "Building2"
  | "Car"
  | "CarTaxiFront"
  | "Clapperboard"
  | "Coffee"
  | "Coins"
  | "CreditCard"
  | "Dumbbell"
  | "Fuel"
  | "Gamepad2"
  | "Gift"
  | "GraduationCap"
  | "Hammer"
  | "HandCoins"
  | "HeartPulse"
  | "House"
  | "Landmark"
  | "Laptop"
  | "Music"
  | "Package"
  | "ParkingMeter"
  | "PawPrint"
  | "Percent"
  | "Phone"
  | "Pill"
  | "Plane"
  | "Receipt"
  | "Scissors"
  | "Shield"
  | "Shirt"
  | "ShoppingBag"
  | "ShoppingBasket"
  | "Sparkles"
  | "Stethoscope"
  | "Store"
  | "Ticket"
  | "TrainFront"
  | "Truck"
  | "Tv"
  | "UtensilsCrossed"
  | "Wifi"
  | "Wrench"
  | "Zap";

// Checked in order; the first prefix that matches the detailed category wins.
const DETAILED: [string, TransactionIconName][] = [
  ["FOOD_AND_DRINK_COFFEE", "Coffee"],
  ["FOOD_AND_DRINK_GROCERIES", "ShoppingBasket"],
  ["FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR", "Beer"],
  ["GENERAL_MERCHANDISE_CLOTHING", "Shirt"],
  ["GENERAL_MERCHANDISE_ELECTRONICS", "Laptop"],
  ["GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", "Package"],
  ["GENERAL_MERCHANDISE_PET_SUPPLIES", "PawPrint"],
  ["GENERAL_MERCHANDISE_GIFTS", "Gift"],
  ["GENERAL_MERCHANDISE_BOOKSTORES", "BookOpen"],
  ["GENERAL_MERCHANDISE_SUPERSTORES", "ShoppingBasket"],
  ["ENTERTAINMENT_TV_AND_MOVIES", "Tv"],
  ["ENTERTAINMENT_MUSIC", "Music"],
  ["ENTERTAINMENT_VIDEO_GAMES", "Gamepad2"],
  ["ENTERTAINMENT_SPORTING_EVENTS", "Ticket"],
  ["GENERAL_SERVICES_AUTOMOTIVE", "Car"],
  ["GENERAL_SERVICES_EDUCATION", "GraduationCap"],
  ["GENERAL_SERVICES_INSURANCE", "Shield"],
  ["GENERAL_SERVICES_POSTAGE", "Truck"],
  ["PERSONAL_CARE_GYMS", "Dumbbell"],
  ["PERSONAL_CARE_HAIR", "Scissors"],
  ["MEDICAL_PHARMACIES", "Pill"],
  ["RENT_AND_UTILITIES_RENT", "House"],
  ["RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "Zap"],
  ["RENT_AND_UTILITIES_INTERNET", "Wifi"],
  ["RENT_AND_UTILITIES_TELEPHONE", "Phone"],
  ["TRANSPORTATION_GAS", "Fuel"],
  ["TRANSPORTATION_PARKING", "ParkingMeter"],
  ["TRANSPORTATION_PUBLIC_TRANSIT", "TrainFront"],
  ["TRANSPORTATION_TAXIS", "CarTaxiFront"],
  ["TRAVEL_FLIGHTS", "Plane"],
  ["TRAVEL_LODGING", "BedDouble"],
  ["TRAVEL_RENTAL_CARS", "Car"],
  ["INCOME_INTEREST", "Percent"],
  ["INCOME_DIVIDENDS", "Coins"],
];

const PRIMARY: Record<string, TransactionIconName> = {
  BANK_FEES: "Receipt",
  ENTERTAINMENT: "Clapperboard",
  FOOD_AND_DRINK: "UtensilsCrossed",
  GENERAL_MERCHANDISE: "ShoppingBag",
  GENERAL_SERVICES: "Wrench",
  GOVERNMENT_AND_NON_PROFIT: "Landmark",
  HOME_IMPROVEMENT: "Hammer",
  INCOME: "Banknote",
  LOAN_DISBURSEMENTS: "HandCoins",
  LOAN_PAYMENTS: "CreditCard",
  MEDICAL: "HeartPulse",
  PERSONAL_CARE: "Sparkles",
  RENT_AND_UTILITIES: "Building2",
  TRANSFER_IN: "ArrowDownLeft",
  TRANSFER_OUT: "ArrowUpRight",
  TRANSFER: "ArrowLeftRight",
  TRANSPORTATION: "Car",
  TRAVEL: "Plane",
};

// Manual entries have no detailed category, so a few clear names stand in for it.
const NAME_HINTS: [RegExp, TransactionIconName][] = [
  [/\b(barber|salon|haircut)\b/i, "Scissors"],
  [/\b(gym|fitness)\b/i, "Dumbbell"],
  [/\b(coffee|starbucks|tim hortons|dunkin)\b/i, "Coffee"],
  [/\b(pharmacy|cvs|walgreens)\b/i, "Pill"],
  [/\b(doctor|dental|dentist|clinic|hospital)\b/i, "Stethoscope"],
  [/\binterest\b/i, "Percent"],
];

export type IconTransaction = DisplayableTransaction & { pfc_detailed?: string | null };

export function transactionIconName(t: IconTransaction): TransactionIconName {
  const category = effectiveCategory(t);
  // Plaid's detailed category only describes Plaid's own main category; one
  // you changed by hand goes by the main category alone.
  const detailed = category === t.pfc_primary ? t.pfc_detailed : null;
  if (detailed) {
    const hit = DETAILED.find(([prefix]) => detailed.startsWith(prefix));
    if (hit) return hit[1];
  } else {
    const name = `${t.merchant_name ?? ""} ${t.name ?? ""}`;
    const hint = NAME_HINTS.find(([pattern]) => pattern.test(name));
    if (hint) return hint[1];
  }
  return (category && PRIMARY[category]) || "Store";
}
