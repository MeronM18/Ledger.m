import { describe, expect, it } from "vitest";
import { benefitBadge, benefitName, cardProgramFor, earnedLabel, programForAccount, freedomCategories, quarterOf, rateLabel, rewardsFor, rewardsSummary, type ProgramId, type RewardTx } from "@/lib/card-rewards";

const CARDS = new Map<string, ProgramId>([
  ["csp", "sapphire-preferred"],
  ["cff", "freedom-flex"],
  ["manual:apple", "apple-card"],
]);

let seq = 0;
const tx = (accountId: string, date: string, amount: number, merchant: string, pfc_primary: string, pfc_detailed?: string): RewardTx => ({
  id: `t${++seq}`,
  date,
  amount,
  merchant,
  pfc_primary,
  pfc_detailed: pfc_detailed ?? null,
  accountId,
});

const one = (t: RewardTx) => rewardsFor([t], CARDS).rewards.get(t.id);

describe("cardProgramFor", () => {
  it("knows the cards by the names banks give them", () => {
    expect(cardProgramFor("Chase Sapphire Preferred")).toBe("sapphire-preferred");
    expect(cardProgramFor("CHASE FREEDOM FLEX")).toBe("freedom-flex");
    expect(cardProgramFor("Apple Card")).toBe("apple-card");
    expect(cardProgramFor("Total Checking")).toBeNull();
  });
});

describe("Sapphire Preferred", () => {
  it("earns 3x dining, delivery included", () => {
    expect(one(tx("csp", "2026-09-10", 42.5, "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"))).toMatchObject({ rate: 3, earned: 128, why: "Dining" });
    expect(one(tx("csp", "2026-09-10", 30, "Uber Eats", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"))).toMatchObject({ rate: 3 });
  });

  it("earns 3x on the named streaming services only", () => {
    expect(one(tx("csp", "2026-09-12", 15.49, "Netflix", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"))).toMatchObject({ rate: 3, why: "Streaming" });
    expect(one(tx("csp", "2026-09-12", 9.99, "Crunchyroll", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"))).toMatchObject({ rate: 1 });
  });

  it("earns 3x on gas from June 15, 2026, and 1x before", () => {
    expect(one(tx("csp", "2026-06-15", 40, "Shell", "TRANSPORTATION", "TRANSPORTATION_GAS"))).toMatchObject({ rate: 3, why: "Gas and EV charging" });
    expect(one(tx("csp", "2026-06-14", 40, "Shell", "TRANSPORTATION", "TRANSPORTATION_GAS"))).toMatchObject({ rate: 1 });
  });

  it("earns 2x on travel, 5x through Chase Travel, and 3x online groceries but not Walmart", () => {
    expect(one(tx("csp", "2026-08-01", 300, "Delta", "TRAVEL", "TRAVEL_FLIGHTS"))).toMatchObject({ rate: 2, earned: 600 });
    expect(one(tx("csp", "2026-08-01", 25, "Uber", "TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES"))).toMatchObject({ rate: 2 });
    expect(one(tx("csp", "2026-08-01", 200, "CL *Chase Travel", "TRAVEL", "TRAVEL_LODGING"))).toMatchObject({ rate: 5 });
    expect(one(tx("csp", "2026-08-01", 80, "Instacart", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"))).toMatchObject({ rate: 3 });
    expect(one(tx("csp", "2026-08-01", 80, "Walmart Instacart", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"))).toMatchObject({ rate: 1 });
  });

  it("takes points back on a refund, and pays none on payments, fees or interest", () => {
    expect(one(tx("csp", "2026-09-11", -20, "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"))).toMatchObject({ earned: -60 });
    expect(one(tx("csp", "2026-09-11", -500, "Payment Thank You", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"))).toBeUndefined();
    expect(one(tx("csp", "2026-09-11", 12, "Interest charge", "BANK_FEES", "BANK_FEES_INTEREST_CHARGE"))).toBeUndefined();
    // However the bank filed it, a payment isn't a refund.
    expect(one(tx("csp", "2026-09-11", -809.59, "Payment Thank You-Mobile", "LOAN_DISBURSEMENTS", "LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT"))).toBeUndefined();
    expect(one(tx("csp", "2026-09-11", -120, "AUTOPAY PAYMENT", "GENERAL_SERVICES"))).toBeUndefined();
  });
});

describe("Freedom Flex", () => {
  it("earns 5x in the quarter's categories, and its usual rate outside them", () => {
    expect(one(tx("cff", "2026-08-03", 50, "Exxon", "TRANSPORTATION", "TRANSPORTATION_GAS"))).toMatchObject({ rate: 5, earned: 250, why: "Quarterly 5%: Gas and EV charging" });
    // Gas isn't a 5% category in the spring.
    expect(one(tx("cff", "2026-04-03", 50, "Exxon", "TRANSPORTATION", "TRANSPORTATION_GAS"))).toMatchObject({ rate: 1 });
    expect(one(tx("cff", "2026-08-03", 50, "Olive Garden", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"))).toMatchObject({ rate: 3, why: "Dining" });
    expect(one(tx("cff", "2026-08-03", 20, "CVS", "MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS"))).toMatchObject({ rate: 3, why: "Drugstores" });
  });

  it("stops the 5% at $1,500 a quarter, in the order purchases were made", () => {
    const a = tx("cff", "2026-07-02", 1400, "Ticketmaster", "ENTERTAINMENT", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS");
    const b = tx("cff", "2026-07-20", 300, "Shell", "TRANSPORTATION", "TRANSPORTATION_GAS");
    const c = tx("cff", "2026-08-01", 40, "Shell", "TRANSPORTATION", "TRANSPORTATION_GAS");
    const { rewards, bonusSpend } = rewardsFor([c, b, a], CARDS);
    expect(rewards.get(a.id)).toMatchObject({ rate: 5, earned: 7000 });
    // $100 left at 5x, the other $200 at 1x.
    expect(rewards.get(b.id)).toMatchObject({ rate: 5, earned: 700, capped: true });
    expect(rewards.get(c.id)).toMatchObject({ rate: 1, earned: 40, capped: true });
    expect(bonusSpend.get("cff|2026-Q3")).toBe(1500);
  });

  it("names each quarter's categories", () => {
    expect(quarterOf("2026-09-24")).toBe("2026-Q3");
    expect(freedomCategories("2026-Q4")).toEqual(["Grocery stores", "Dining", "American Red Cross"]);
    expect(freedomCategories("2019-Q1")).toEqual([]);
  });
});

describe("Apple Card", () => {
  it("pays 3% at Apple and its partners, 2% elsewhere, in Daily Cash", () => {
    expect(one(tx("manual:apple", "2026-09-01", 10.99, "Apple.com/bill", "ENTERTAINMENT"))).toMatchObject({ unit: "cash", rate: 3, earned: 0.33 });
    expect(one(tx("manual:apple", "2026-09-01", 23.4, "Uber", "TRANSPORTATION"))).toMatchObject({ rate: 3, why: "Uber" });
    expect(one(tx("manual:apple", "2026-09-01", 31.25, "Trader Joe's", "FOOD_AND_DRINK"))).toMatchObject({ rate: 2, earned: 0.63, why: "Apple Pay" });
    // Applebee's isn't Apple, and T-Mobile left the 3% list in July 2025.
    expect(one(tx("manual:apple", "2026-09-01", 40, "Applebee's", "FOOD_AND_DRINK"))).toMatchObject({ rate: 2 });
    expect(one(tx("manual:apple", "2026-09-01", 70, "T-Mobile", "RENT_AND_UTILITIES"))).toMatchObject({ rate: 2 });
    expect(one(tx("manual:apple", "2025-05-01", 70, "T-Mobile", "RENT_AND_UTILITIES"))).toMatchObject({ rate: 3 });
  });
});

describe("labels", () => {
  it("read as points or cash", () => {
    expect(rateLabel({ unit: "points", rate: 3 })).toBe("3x");
    expect(rateLabel({ unit: "cash", rate: 2 })).toBe("2%");
    expect(earnedLabel({ unit: "points", earned: 1280 })).toBe("+1,280 pts");
    expect(earnedLabel({ unit: "points", earned: -60 })).toBe("-60 pts");
    expect(earnedLabel({ unit: "cash", earned: 0.63 })).toBe("+$0.63");
  });

  it("leaves cards without a program alone", () => {
    expect(one(tx("checking", "2026-09-01", 20, "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"))).toBeUndefined();
  });
});

describe("rewardsSummary", () => {
  it("adds up each card's month and year, by what it was for, with Freedom Flex's quarter", () => {
    const txs = [
      tx("csp", "2026-09-10", 100, "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"),
      tx("csp", "2026-03-10", 200, "Delta", "TRAVEL", "TRAVEL_FLIGHTS"),
      tx("csp", "2025-12-10", 500, "Delta", "TRAVEL", "TRAVEL_FLIGHTS"),
      tx("cff", "2026-08-03", 50, "Exxon", "TRANSPORTATION", "TRANSPORTATION_GAS"),
    ];
    const { rewards, bonusSpend } = rewardsFor(txs, CARDS);
    const withRewards = txs.map((t) => ({ accountId: t.accountId, date: t.date, reward: rewards.get(t.id) }));
    const [csp, cff] = rewardsSummary(
      [
        { accountId: "csp", name: "Sapphire", program: "sapphire-preferred" },
        { accountId: "cff", name: "Freedom", program: "freedom-flex" },
      ],
      withRewards,
      Object.fromEntries(bonusSpend),
      "2026-09-24"
    );
    expect(csp).toMatchObject({ thisMonth: 300, thisYear: 700, quarter: null });
    expect(csp.byWhy).toEqual([
      { why: "Travel", earned: 400 },
      { why: "Dining", earned: 300 },
    ]);
    expect(cff.quarter).toEqual({
      quarter: "2026-Q3",
      categories: ["Gas and EV charging", "Public transit", "Live entertainment", "United Way"],
      used: 50,
      cap: 1500,
      ends: "2026-09-30",
    });
    expect(cff.byWhy).toEqual([{ why: "Rotating 5% categories", earned: 250 }]);
    expect(csp.balance).toBeNull();
  });

  it("starts from the balance you entered and adds purchases made after it", () => {
    const txs = [
      tx("csp", "2026-09-10", 100, "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"),
      tx("csp", "2026-09-20", 50, "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"),
    ];
    const { rewards, bonusSpend } = rewardsFor(txs, CARDS);
    const [csp] = rewardsSummary(
      [{ accountId: "csp", name: "Sapphire", program: "sapphire-preferred", balance: { available: 125045, pending: 2030, asOf: "2026-09-15" } }],
      txs.map((t) => ({ accountId: t.accountId, date: t.date, reward: rewards.get(t.id) })),
      Object.fromEntries(bonusSpend),
      "2026-09-24"
    );
    // Only the Sep 20 dinner (3x on $50) came after Sep 15.
    expect(csp.balance).toEqual({ available: 125045, pending: 2030, asOf: "2026-09-15", since: 150, total: 127225 });
  });

  it("counts Daily Cash entered this year, and drops last year's", () => {
    const txs = [tx("apple", "2026-09-20", 100, "Apple Store", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ELECTRONICS")];
    const programs = new Map([["apple", "apple-card" as ProgramId]]);
    const { rewards, bonusSpend } = rewardsFor(txs, programs);
    const summary = (asOf: string) =>
      rewardsSummary(
        [{ accountId: "apple", name: "Apple Card", program: "apple-card", balance: { available: 155.28, pending: 0, asOf } }],
        txs.map((t) => ({ accountId: t.accountId, date: t.date, reward: rewards.get(t.id) })),
        Object.fromEntries(bonusSpend),
        "2026-09-24"
      )[0];
    // $3 back on $100 at Apple, after the Sep 15 entry.
    expect(summary("2026-09-15").balance).toEqual({ available: 155.28, pending: 0, asOf: "2026-09-15", since: 3, total: 158.28 });
    expect(summary("2025-12-20").balance).toBeNull();
  });
});

describe("programForAccount", () => {
  it("goes by the card's chosen program, then any of its names, your nickname included", () => {
    expect(programForAccount(["Sapphire Preferred", null, "CREDIT CARD"])).toBe("sapphire-preferred");
    expect(programForAccount(["My travel card", null, "CREDIT CARD"])).toBeNull();
    expect(programForAccount(["My travel card", null, "CREDIT CARD"], "sapphire-preferred")).toBe("sapphire-preferred");
    expect(programForAccount(["Chase Sapphire Preferred"], "none")).toBeNull();
  });
});

describe("benefitBadge", () => {
  const r = (unit: "points" | "cash", rate: number, earned: number, why: string) => ({ program: "sapphire-preferred" as const, unit, rate, earned, why });

  it("names the multiplier and what for, on a points card, above 1x", () => {
    expect(benefitBadge(r("points", 3, 128, "Dining"))).toBe("3x dining");
    expect(benefitBadge(r("points", 5, 200, "Chase Travel"))).toBe("5x Chase Travel");
    expect(benefitBadge(r("points", 5, 204, "Quarterly 5%: Gas and EV charging"))).toBe("5x gas and EV charging");
    expect(benefitBadge(r("points", 5, 50, "Quarterly 5%: United Way"))).toBe("5x United Way");
    expect(benefitBadge(r("points", 1, 13, "Everything else"))).toBeNull();
  });

  it("says Daily Cash in dollars on Apple Card, and nothing for a refund", () => {
    expect(benefitBadge(r("cash", 3, 4.23, "Apple"))).toBe("$4.23 Daily Cash");
    expect(benefitBadge(r("cash", 2, 0.06, "Apple Pay"))).toBe("$0.06 Daily Cash");
    expect(benefitBadge(r("points", 3, -60, "Dining"))).toBeNull();
  });

  it("keeps names that are names", () => {
    expect(benefitName("EV charging")).toBe("EV charging");
    expect(benefitName("Online groceries")).toBe("online groceries");
    expect(benefitName("McDonald's")).toBe("McDonald's");
  });
});
