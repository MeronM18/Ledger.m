// Pure. What each purchase on a rewards card earned, estimated from what
// the bank says it was (its category and the merchant's name), since
// issuers pay by the merchant's category code, which banks don't pass on.
//
// The programs, as the issuers publish them (checked September 2026):
//
// - Chase Sapphire Preferred (Ultimate Rewards points). From June 15, 2026:
//   5x Chase Travel and Lyft; 3x dining (takeout and delivery too), select
//   streaming, online groceries (not Target, Walmart or wholesale clubs),
//   gas and EV charging, and vacation homes (Airbnb, Vrbo and a few more);
//   2x other travel; 1x everything else. Before then the same, less gas, EV
//   charging and vacation homes (which counted as travel, at 2x).
// - Chase Freedom Flex (cash back, paid as Ultimate Rewards points): 5x
//   Chase Travel, 3x dining and drugstores, 1x everything else, and 5x in
//   each quarter's rotating categories on the first $1,500 there combined.
//   Those need activating each quarter; this assumes they were.
// - Apple Card (Daily Cash): 3% at Apple and select merchants, 2% with
//   Apple Pay, 1% with the physical card. Statements don't say which was
//   used, so everything else is counted at the Apple Pay 2%.

export type ProgramId = "sapphire-preferred" | "freedom-flex" | "apple-card";

export type Program = {
  id: ProgramId;
  name: string;
  // Chase pays points (a point a dollar at 1x); Apple pays cash.
  unit: "points" | "cash";
};

export const PROGRAMS: Record<ProgramId, Program> = {
  "sapphire-preferred": { id: "sapphire-preferred", name: "Chase Sapphire Preferred", unit: "points" },
  "freedom-flex": { id: "freedom-flex", name: "Chase Freedom Flex", unit: "points" },
  "apple-card": { id: "apple-card", name: "Apple Card", unit: "cash" },
};

/** Which program a card is, from its name as the bank or you gave it. */
export function cardProgramFor(text: string): ProgramId | null {
  const t = text.toLowerCase();
  if (/sapphire\s+preferred/.test(t)) return "sapphire-preferred";
  if (/freedom\s+flex/.test(t)) return "freedom-flex";
  if (/apple\s+card/.test(t)) return "apple-card";
  return null;
}

/**
 * A card's program: the one chosen in its settings, or else whichever its
 * names say (your nickname, the product name, the bank's name).
 */
export function programForAccount(names: (string | null | undefined)[], chosen?: ProgramId | "none" | null): ProgramId | null {
  if (chosen === "none") return null;
  if (chosen) return chosen;
  return cardProgramFor(names.filter(Boolean).join(" "));
}

export type RewardTx = {
  id: string;
  date: string; // the day of the purchase
  amount: number; // Plaid's sign: positive is a purchase, negative a refund
  pfc_primary: string | null;
  pfc_detailed?: string | null;
  // The merchant as the bank named it (not as renamed), and its raw description.
  merchant: string;
  accountId: string | null;
  pending?: boolean;
};

export type Reward = {
  program: ProgramId;
  unit: "points" | "cash";
  // Points a dollar, or percent back: 3 is 3x or 3%.
  rate: number;
  // Whole points, or dollars to the cent; negative for a refund.
  earned: number;
  // What it earned that rate for: "Dining", "Quarterly 5%: Gas stations".
  why: string;
  // Part of it went past the quarter's $1,500 and earned the usual rate.
  capped?: boolean;
};

// ---- What a purchase is -------------------------------------------------------

type Test = (t: RewardTx, text: string) => boolean;

const detailed = (...prefixes: string[]): Test => (t) => prefixes.some((p) => (t.pfc_detailed ?? "").startsWith(p));
const named = (pattern: RegExp): Test => (_, text) => pattern.test(text);
const either = (...tests: Test[]): Test => (t, text) => tests.some((f) => f(t, text));
const not = (test: Test): Test => (t, text) => !test(t, text);
const both = (...tests: Test[]): Test => (t, text) => tests.every((f) => f(t, text));

const DELIVERY = /\b(doordash|door dash|uber\s*eats|grubhub|postmates|caviar|seamless)\b/;
const isDining = either(
  detailed("FOOD_AND_DRINK_RESTAURANT", "FOOD_AND_DRINK_FAST_FOOD", "FOOD_AND_DRINK_COFFEE", "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK"),
  named(DELIVERY)
);
const BIG_BOX = /\b(target|walmart|wal-mart|costco|sam'?s club|bj'?s wholesale)\b/;
const isGrocery = both(detailed("FOOD_AND_DRINK_GROCERIES"), not(named(BIG_BOX)));
const isOnlineGrocery = both(named(/\b(instacart|shipt|freshdirect|fresh direct|thrive market|misfits market|amazon fresh|peapod|gopuff)\b/), not(named(BIG_BOX)));
const isStreaming = named(
  /\b(apple music|apple tv|disney\s*(\+|plus)|espn\s*(\+|plus)|fubo|hbo\s*max|hulu|netflix|pandora|paramount\s*(\+|plus)|peacock|showtime|sirius\s*xm|siriusxm|sling|spotify|youtube\s*(premium|tv)|vudu)\b/
);
const EV = /\b(chargepoint|electrify america|evgo|tesla supercharger|blink charging)\b/;
const isGas = detailed("TRANSPORTATION_GAS");
const isEv = named(EV);
const isChaseTravel = named(/\bchase travel\b/);
const isLyft = named(/\blyft\b/);
const isVacationHome = named(/\b(airbnb|vrbo|plum guide|homeaway|homestay|vacasa)\b/);
// Chase's travel: airlines, hotels, rental cars, cruises, travel agencies,
// trains, buses, taxis and rideshares, ferries, tolls, parking.
const isTravel = either(
  (t) => t.pfc_primary === "TRAVEL",
  detailed("TRANSPORTATION_TAXIS", "TRANSPORTATION_PUBLIC_TRANSIT", "TRANSPORTATION_TOLLS", "TRANSPORTATION_PARKING")
);
const isDrugstore = either(detailed("MEDICAL_PHARMACIES"), named(/\b(cvs|walgreens|rite aid|duane reade)\b/));
const isTransit = detailed("TRANSPORTATION_PUBLIC_TRANSIT", "TRANSPORTATION_TOLLS", "TRANSPORTATION_PARKING");
const isLiveEntertainment = either(
  detailed("ENTERTAINMENT_SPORTING_EVENTS"),
  named(/\b(ticketmaster|live nation|stubhub|seatgeek|vivid seats|axs|amc theat|regal|cinemark|fandango)\b/)
);

// Payments, transfers, fees and interest, and credits earn nothing. Banks
// file a card payment under all sorts (even LOAN_DISBURSEMENTS), so a
// credit named like a payment is one, whatever its category.
function earnsNothing(t: RewardTx, text: string): boolean {
  const primary = t.pfc_primary ?? "";
  if (primary.startsWith("LOAN_") || primary.startsWith("TRANSFER_") || primary === "BANK_FEES" || primary === "INCOME") return true;
  return t.amount < 0 && /\b(payment|autopay|thank you)\b/.test(text);
}

type Rule = { rate: number; why: string; test: Test; from?: string; to?: string };

const applies = (r: Rule, t: RewardTx, text: string) => (!r.from || t.date >= r.from) && (!r.to || t.date <= r.to) && r.test(t, text);

const SAPPHIRE: Rule[] = [
  { rate: 5, why: "Chase Travel", test: isChaseTravel },
  { rate: 5, why: "Lyft", test: isLyft, to: "2027-09-30" },
  { rate: 3, why: "Dining", test: isDining },
  { rate: 3, why: "Streaming", test: isStreaming },
  { rate: 3, why: "Online groceries", test: isOnlineGrocery },
  { rate: 3, why: "Gas and EV charging", test: either(isGas, isEv), from: "2026-06-15" },
  { rate: 3, why: "Vacation homes", test: isVacationHome, from: "2026-06-15" },
  { rate: 2, why: "Travel", test: either(isTravel, isVacationHome) },
  { rate: 1, why: "Everything else", test: () => true },
];

const FREEDOM: Rule[] = [
  { rate: 5, why: "Chase Travel", test: isChaseTravel },
  { rate: 3, why: "Dining", test: isDining },
  { rate: 3, why: "Drugstores", test: isDrugstore },
  { rate: 1, why: "Everything else", test: () => true },
];

const APPLE: Rule[] = [
  { rate: 3, why: "Apple", test: named(/\b(apple(\.com| store)?|itunes)\b(?!\s*card)/) },
  { rate: 3, why: "Uber", test: named(/\buber\b/) },
  { rate: 3, why: "Walgreens", test: named(/\b(walgreens|duane reade)\b/) },
  { rate: 3, why: "Exxon Mobil", test: named(/\b(exxon|mobil)\b/) },
  { rate: 3, why: "Nike", test: named(/\bnike\b/) },
  { rate: 3, why: "Ace Hardware", test: named(/\bace hardware\b/) },
  { rate: 3, why: "ChargePoint", test: named(/\bchargepoint\b/) },
  { rate: 3, why: "Hertz", test: named(/\bhertz\b/) },
  { rate: 3, why: "Booking.com", test: named(/\bbooking\.com\b/) },
  { rate: 3, why: "T-Mobile", test: named(/\bt-?mobile\b/), to: "2025-06-30" },
  { rate: 3, why: "Panera", test: named(/\bpanera\b/), to: "2025-01-31" },
  { rate: 2, why: "Apple Pay", test: () => true },
];

const RULES: Record<ProgramId, Rule[]> = { "sapphire-preferred": SAPPHIRE, "freedom-flex": FREEDOM, "apple-card": APPLE };

// ---- Freedom Flex's rotating 5% ----------------------------------------------

export const FREEDOM_QUARTER_CAP = 1500;

type Bonus = { why: string; test: Test };

const charity = (name: RegExp): Test => named(name);

/** Each quarter's 5% categories, as Chase announced them. */
export const FREEDOM_QUARTERS: Record<string, Bonus[]> = {
  "2024-Q4": [
    { why: "McDonald's", test: named(/\bmcdonald'?s\b/) },
    { why: "PayPal", test: named(/\bpaypal\b/) },
    { why: "Pet shops and vets", test: detailed("GENERAL_MERCHANDISE_PET_SUPPLIES", "MEDICAL_VETERINARY") },
  ],
  "2025-Q1": [
    { why: "Grocery stores", test: isGrocery },
    { why: "Gyms and fitness clubs", test: detailed("PERSONAL_CARE_GYMS") },
    { why: "Hair, nails and spas", test: detailed("PERSONAL_CARE_HAIR") },
    { why: "Norwegian Cruise Line", test: named(/\bnorwegian cruise\b/) },
  ],
  "2025-Q2": [
    { why: "Amazon", test: named(/\bamazon\b/) },
    { why: "Streaming", test: isStreaming },
  ],
  "2025-Q3": [
    { why: "Instacart", test: named(/\binstacart\b/) },
    { why: "Gas stations", test: isGas },
    { why: "EV charging", test: isEv },
    { why: "Live entertainment", test: isLiveEntertainment },
  ],
  "2025-Q4": [
    { why: "Chase Travel", test: isChaseTravel },
    { why: "Department stores", test: detailed("GENERAL_MERCHANDISE_DEPARTMENT_STORES") },
    { why: "Old Navy", test: named(/\bold navy\b/) },
    { why: "PayPal", test: named(/\bpaypal\b/) },
  ],
  "2026-Q1": [
    { why: "Norwegian Cruise Line", test: named(/\bnorwegian cruise\b/) },
    { why: "Dining", test: isDining },
    { why: "American Heart Association", test: charity(/\bamerican heart\b/) },
  ],
  "2026-Q2": [
    { why: "Amazon", test: named(/\bamazon\b/) },
    { why: "Chase Travel", test: isChaseTravel },
    { why: "Feeding America", test: charity(/\bfeeding america\b/) },
  ],
  "2026-Q3": [
    { why: "Gas and EV charging", test: either(isGas, isEv) },
    { why: "Public transit", test: isTransit },
    { why: "Live entertainment", test: isLiveEntertainment },
    { why: "United Way", test: charity(/\bunited way\b/) },
  ],
  "2026-Q4": [
    { why: "Grocery stores", test: isGrocery },
    { why: "Dining", test: isDining },
    { why: "American Red Cross", test: charity(/\bred cross\b/) },
  ],
};

/** "2026-Q3" for a day in July through September 2026. */
export function quarterOf(iso: string): string {
  return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
}

/** The quarter's 5% categories, by name; empty when they aren't known. */
export function freedomCategories(quarter: string): string[] {
  return (FREEDOM_QUARTERS[quarter] ?? []).map((b) => b.why);
}

// ---- Earning ------------------------------------------------------------------

const earn = (unit: "points" | "cash", amount: number, rate: number) =>
  unit === "points" ? Math.round(amount * rate) : Math.round(amount * rate) / 100;

/**
 * What every purchase on a rewards card earned, by transaction id, and how
 * much of each Freedom Flex quarter's $1,500 went to its 5% categories
 * (keyed "<account id>|<quarter>"). `programOf` maps an account id to its
 * card's program; anything else earns nothing here.
 */
export function rewardsFor(
  transactions: RewardTx[],
  programOf: Map<string, ProgramId>
): { rewards: Map<string, Reward>; bonusSpend: Map<string, number> } {
  const rewards = new Map<string, Reward>();
  const bonusSpend = new Map<string, number>();
  // Oldest first, so the quarter's cap fills in the order Chase fills it.
  const ordered = transactions
    .filter((t) => t.accountId && programOf.has(t.accountId) && !t.pending && t.amount !== 0 && !earnsNothing(t, t.merchant.toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const t of ordered) {
    const program = PROGRAMS[programOf.get(t.accountId!)!];
    const text = t.merchant.toLowerCase();
    const rule = RULES[program.id].find((r) => applies(r, t, text))!;

    if (program.id === "freedom-flex") {
      const quarter = quarterOf(t.date);
      const bonus = (FREEDOM_QUARTERS[quarter] ?? []).find((b) => b.test(t, text));
      if (bonus && rule.rate < 5) {
        const key = `${t.accountId}|${quarter}`;
        const used = bonusSpend.get(key) ?? 0;
        if (t.amount < 0) {
          // A refund takes back what it earned; the cap isn't given back.
          rewards.set(t.id, { program: program.id, unit: program.unit, rate: 5, earned: earn(program.unit, t.amount, 5), why: `Quarterly 5%: ${bonus.why}` });
          continue;
        }
        const inCap = Math.max(0, Math.min(t.amount, FREEDOM_QUARTER_CAP - used));
        if (inCap > 0) {
          bonusSpend.set(key, Math.round((used + inCap) * 100) / 100);
          const earned = Math.round(inCap * 5 + (t.amount - inCap) * rule.rate);
          rewards.set(t.id, {
            program: program.id,
            unit: program.unit,
            rate: 5,
            earned,
            why: `Quarterly 5%: ${bonus.why}`,
            ...(inCap < t.amount ? { capped: true } : {}),
          });
          continue;
        }
        // Past the cap: the usual rate, noted.
        rewards.set(t.id, { program: program.id, unit: program.unit, rate: rule.rate, earned: earn(program.unit, t.amount, rule.rate), why: rule.why, capped: true });
        continue;
      }
    }

    rewards.set(t.id, { program: program.id, unit: program.unit, rate: rule.rate, earned: earn(program.unit, t.amount, rule.rate), why: rule.why });
  }
  return { rewards, bonusSpend };
}

// Names that stay capitalized mid-sentence.
const PROPER = /^(Chase Travel|Lyft|Amazon|Instacart|McDonald's|PayPal|Old Navy|Norwegian Cruise Line|United Way|American Red Cross|American Heart Association|Feeding America|Apple|Apple Pay|Uber|Walgreens|Exxon Mobil|Nike|Ace Hardware|ChargePoint|Hertz|Booking\.com|T-Mobile|Panera)$/;

/** What a purchase earned its rate for, as it reads mid-sentence: "dining", "gas and EV charging", "Chase Travel". */
export function benefitName(why: string): string {
  const name = why.replace(/^Quarterly 5%: /, "");
  if (PROPER.test(name) || !/^[A-Z][a-z]/.test(name)) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * The card benefit a purchase used, for its row: "3x dining" on a points
 * card (only above its 1x base, where there's a benefit to show), or
 * "$4.23 Daily Cash" on Apple Card. Null for anything else.
 */
export function benefitBadge(r: Reward): string | null {
  if (r.earned <= 0) return null;
  if (r.unit === "cash") return `$${r.earned.toFixed(2)} Daily Cash`;
  return r.rate > 1 ? `${r.rate}x ${benefitName(r.why)}` : null;
}

/** "3x", "2%": how a rate reads for its program. */
export function rateLabel(r: Pick<Reward, "unit" | "rate">): string {
  return r.unit === "points" ? `${r.rate}x` : `${r.rate}%`;
}

/** "+37 pts", "+$0.62": what a purchase earned, short. */
export function earnedLabel(r: Pick<Reward, "unit" | "earned">): string {
  const sign = r.earned < 0 ? "-" : "+";
  const abs = Math.abs(r.earned);
  return r.unit === "points" ? `${sign}${abs.toLocaleString("en-US")} pts` : `${sign}$${abs.toFixed(2)}`;
}

export type CardRewards = {
  accountId: string;
  name: string;
  program: ProgramId;
  unit: "points" | "cash";
  thisMonth: number;
  thisYear: number;
  // This year's earnings by what they were for, largest first.
  byWhy: { why: string; earned: number }[];
  // Freedom Flex: this quarter's 5% categories and how much of the $1,500 they've used.
  quarter: { quarter: string; categories: string[]; used: number; cap: number; ends: string } | null;
};

/** Each rewards card's month and year so far, where it came from, and Freedom Flex's quarter. */
export function rewardsSummary(
  cards: { accountId: string; name: string; program: ProgramId }[],
  transactions: { accountId: string | null; date: string; reward?: Reward }[],
  bonusSpend: Record<string, number>,
  todayIso: string
): CardRewards[] {
  const month = todayIso.slice(0, 7);
  const year = todayIso.slice(0, 4);
  const round = (unit: "points" | "cash", n: number) => (unit === "points" ? Math.round(n) : Math.round(n * 100) / 100);
  return cards.map((c) => {
    const unit = PROGRAMS[c.program].unit;
    let thisMonth = 0;
    let thisYear = 0;
    const byWhy = new Map<string, number>();
    for (const t of transactions) {
      if (t.accountId !== c.accountId || !t.reward || t.date.slice(0, 4) !== year || t.date > todayIso) continue;
      thisYear += t.reward.earned;
      if (t.date.slice(0, 7) === month) thisMonth += t.reward.earned;
      const why = t.reward.why.startsWith("Quarterly 5%") ? "Rotating 5% categories" : t.reward.why;
      byWhy.set(why, (byWhy.get(why) ?? 0) + t.reward.earned);
    }
    const q = quarterOf(todayIso);
    const qEndMonth = Number(q.slice(-1)) * 3;
    const ends = new Date(Date.UTC(Number(year), qEndMonth, 0)).toISOString().slice(0, 10);
    return {
      ...c,
      unit,
      thisMonth: round(unit, thisMonth),
      thisYear: round(unit, thisYear),
      byWhy: Array.from(byWhy, ([why, earned]) => ({ why, earned: round(unit, earned) }))
        .filter((w) => w.earned > 0)
        .sort((a, b) => b.earned - a.earned),
      quarter:
        c.program === "freedom-flex"
          ? { quarter: q, categories: freedomCategories(q), used: bonusSpend[`${c.accountId}|${q}`] ?? 0, cap: FREEDOM_QUARTER_CAP, ends }
          : null,
    };
  });
}
