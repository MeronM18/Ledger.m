// Fake data for the browser tests and local previews: about 14 months of
// believable history for one person paid on commission, built relative to
// today so the "this month" views always have something in them. Seeded,
// so every run produces the same numbers.

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const money = (n) => Math.round(n * 100) / 100;

let seq = 0;
const uuid = (prefix) => {
  seq += 1;
  return `${prefix.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${String(seq).padStart(12, "0")}`;
};

export const IDS = {
  itemChase: "11111111-0000-4000-8000-000000000001",
  itemFifth: "11111111-0000-4000-8000-000000000002",
  itemAmex: "11111111-0000-4000-8000-000000000003",
  checking: "22222222-0000-4000-8000-000000000001",
  freedom: "22222222-0000-4000-8000-000000000002",
  momentum: "22222222-0000-4000-8000-000000000003",
  savings: "22222222-0000-4000-8000-000000000004",
  appleCard: "33333333-0000-4000-8000-000000000001",
  appleSavings: "33333333-0000-4000-8000-000000000002",
};

export function buildFixtures(now = new Date()) {
  seq = 0;
  const rand = rng(20260923);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  // The app's "today" is the Eastern date, so the data's is too.
  const easternDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const today = new Date(`${easternDate}T00:00:00Z`);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 14, 1));
  const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000).toISOString();

  const items = [
    { id: IDS.itemChase, plaid_item_id: "item-chase", institution_id: "ins_3", institution_name: "Chase", status: "active", error_code: null, last_synced_at: hoursAgo(2), created_at: "2025-01-10T12:00:00Z" },
    { id: IDS.itemFifth, plaid_item_id: "item-fifth", institution_id: "ins_9", institution_name: "Fifth Third Bank", status: "requires_reauth", error_code: "ITEM_LOGIN_REQUIRED", last_synced_at: hoursAgo(9 * 24), created_at: "2025-02-02T12:00:00Z" },
    { id: IDS.itemAmex, plaid_item_id: "item-amex", institution_id: "ins_10", institution_name: "American Express", status: "active", error_code: null, last_synced_at: hoursAgo(3), created_at: "2025-03-15T12:00:00Z" },
  ];

  const accounts = [
    { id: IDS.checking, item_id: IDS.itemChase, plaid_account_id: "acc-checking", name: "Total Checking", official_name: "Chase Total Checking", mask: "1234", type: "depository", subtype: "checking", current_balance: 4210.55, available_balance: 4180.2, credit_limit: null, apy: null, iso_currency_code: "USD", is_hidden: false },
    { id: IDS.freedom, item_id: IDS.itemChase, plaid_account_id: "acc-freedom", name: "Freedom Unlimited", official_name: null, mask: "7788", type: "credit", subtype: "credit card", current_balance: 842.13, available_balance: 7157.87, credit_limit: 8000, apy: null, iso_currency_code: "USD", is_hidden: false },
    { id: IDS.momentum, item_id: IDS.itemFifth, plaid_account_id: "acc-momentum", name: "MOMENTUM CHECKING", official_name: null, mask: "5521", type: "depository", subtype: "checking", current_balance: 612.4, available_balance: 612.4, credit_limit: null, apy: null, iso_currency_code: "USD", is_hidden: false },
    { id: IDS.savings, item_id: IDS.itemAmex, plaid_account_id: "acc-savings", name: "High Yield Savings", official_name: null, mask: "0042", type: "depository", subtype: "savings", current_balance: 18250, available_balance: 18250, credit_limit: null, apy: 3.7, iso_currency_code: "USD", is_hidden: false },
  ];

  const transactions = [];
  const tx = (date, accountId, amount, name, merchant, primary, detailed, extra = {}) => {
    if (date > today) return;
    transactions.push({
      id: uuid("tx"),
      account_id: accountId,
      plaid_transaction_id: `plaid-${seq}`,
      date: iso(date),
      amount: money(amount),
      iso_currency_code: "USD",
      name,
      merchant_name: merchant,
      logo_url: null,
      pfc_primary: primary,
      pfc_detailed: detailed,
      pending: false,
      ...extra,
    });
  };

  // Commission pay: a small draw plus whatever closed that period, so some
  // months are thin and some are big.
  const commission = [3.1, 0.9, 4.8, 2.2, 1.4, 6.3, 2.7, 0.6, 3.9, 5.1, 1.8, 2.4, 4.2, 3.3, 2.9];
  for (let m = 0; m <= 14; m++) {
    const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    const at = (day) => new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day));
    const big = commission[m % commission.length];

    tx(at(15), IDS.checking, -(1450 + big * 820 + between(0, 90)), "UNITED MORTGAGE PAYROLL 925644358895XMS", null, "INCOME", "INCOME_WAGES");
    tx(lastDay, IDS.checking, -(1450 + big * 610 + between(0, 90)), "UNITED MORTGAGE PAYROLL 925644358895XMS", null, "INCOME", "INCOME_WAGES");
    tx(lastDay, IDS.savings, -(48 + m * 0.9), "INTEREST PAYMENT", null, "INCOME", "INCOME_INTEREST_EARNED");

    tx(at(1), IDS.checking, 1850, "PARKVIEW APTS RENT", "Parkview Apartments", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT");
    tx(at(6), IDS.checking, between(84, 138), "DUKE ENERGY", "Duke Energy", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY");
    tx(at(9), IDS.checking, 79.99, "SPECTRUM", "Spectrum", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE");
    tx(at(12), IDS.freedom, 15.49, "NETFLIX.COM", "Netflix", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES");
    tx(at(18), IDS.freedom, 11.99, "SPOTIFY", "Spotify", "ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO");
    tx(at(28), IDS.checking, 19.99, "EDGE FITNESS", "Edge Fitness Club", "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS");
    tx(at(22), IDS.freedom, 9.99, "APPLE.COM/BILL", "iCloud+", "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES");
    tx(at(20), IDS.checking, 780 + between(0, 260), "CHASE CREDIT CRD AUTOPAY", "Chase", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
    if (m % 3 === 1) tx(at(11), IDS.freedom, between(30, 95), "CVS PHARMACY", "CVS Pharmacy", "MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS");
    if (m % 6 === 4) tx(at(3), IDS.checking, 100, "AMERICAN RED CROSS", "American Red Cross", "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_DONATIONS");

    for (let d = 2; d <= lastDay.getUTCDate(); d += 7) {
      tx(at(d), IDS.freedom, between(72, 148), "KROGER", "Kroger", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES");
      tx(at(Math.min(d + 2, lastDay.getUTCDate())), IDS.freedom, between(9, 34), "CHIPOTLE", "Chipotle", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD");
      tx(at(Math.min(d + 4, lastDay.getUTCDate())), IDS.freedom, between(38, 62), "SHELL OIL", "Shell", "TRANSPORTATION", "TRANSPORTATION_GAS");
      if (rand() < 0.55) tx(at(Math.min(d + 1, lastDay.getUTCDate())), IDS.freedom, between(14, 120), "AMAZON MKTPL", "Amazon", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES");
      if (rand() < 0.4) tx(at(Math.min(d + 5, lastDay.getUTCDate())), IDS.freedom, between(5, 7), "STARBUCKS", "Starbucks", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE");
    }
    if (m === 7) tx(at(19), IDS.freedom, 1240, "DELTA AIR LINES", "Delta", "TRAVEL", "TRAVEL_FLIGHTS");
    if (m === 11) tx(at(8), IDS.freedom, 689, "BEST BUY", "Best Buy", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ELECTRONICS");
  }

  // Far above what Kroger usually costs: the unusual-charge alert's case.
  tx(addDays(today, -1), IDS.freedom, 486.2, "KROGER", "Kroger", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES");
  tx(today, IDS.freedom, 6.45, "STARBUCKS", "Starbucks", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", { pending: true });

  const manual_accounts = [
    { id: IDS.appleCard, name: "Apple Card", institution_name: "Apple", type: "credit", mask: null, credit_limit: 5000, balance_override: null, apy: null, created_at: "2026-09-01T12:00:00Z" },
    { id: IDS.appleSavings, name: "Apple Savings", institution_name: "Apple", type: "depository", mask: null, credit_limit: null, balance_override: 334.38, apy: 3.65, created_at: "2026-09-02T12:00:00Z" },
  ];

  const manual_transactions = [];
  const mtx = (date, name, amount, primary, accountId = null, extra = {}) => {
    if (date > today) return;
    manual_transactions.push({ id: uuid("mtx"), date: iso(date), name, amount: money(amount), pfc_primary: primary, payment_method: accountId ? null : "cash", notes: null, manual_account_id: accountId, source: accountId ? "apple" : "manual", external_id: accountId ? `ext-${seq}` : null, ...extra });
  };
  for (let m = 8; m <= 14; m++) {
    const at = (day) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, day));
    mtx(at(4), "Whole Foods", between(40, 110), "FOOD_AND_DRINK", IDS.appleCard);
    mtx(at(13), "Uber", between(12, 38), "TRANSPORTATION", IDS.appleCard);
    mtx(at(21), "Apple Store", between(20, 60), "GENERAL_MERCHANDISE", IDS.appleCard);
    mtx(at(25), "Payment to Apple Card", -between(90, 200), "TRANSFER_OUT", IDS.appleCard);
    mtx(at(26), "Daily Cash", -between(1.5, 4.5), "INCOME", IDS.appleSavings);
    mtx(at(28), "Interest", -between(0.9, 1.2), "INCOME", IDS.appleSavings);
  }
  mtx(addDays(today, -6), "Farmers market", 24, "FOOD_AND_DRINK");

  const recurring_streams = [
    ["Netflix", 15.49, IDS.freedom, 12],
    ["Spotify", 11.99, IDS.freedom, 18],
    ["Edge Fitness Club", 19.99, IDS.checking, 28],
    ["iCloud+", 9.99, IDS.freedom, 22],
    ["Spectrum", 79.99, IDS.checking, 9],
  ].map(([merchant, amount, accountId, day]) => {
    const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + (today.getUTCDate() >= day ? 1 : 0), day));
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() - 1, day));
    return { id: uuid("rs"), stream_id: `stream-${merchant}`, account_id: accountId, direction: "outflow", description: merchant.toUpperCase(), merchant_name: merchant, frequency: "MONTHLY", average_amount: amount, last_amount: amount, first_date: iso(start), last_date: iso(last), predicted_next_date: iso(next), status: "MATURE", is_active: true, pfc_primary: "ENTERTAINMENT", pfc_detailed: null, transaction_ids: [], user_marked_cancelled: false };
  });
  recurring_streams.push({ id: uuid("rs"), stream_id: "stream-payroll", account_id: IDS.checking, direction: "inflow", description: "UNITED MORTGAGE PAYROLL", merchant_name: null, frequency: "SEMI_MONTHLY", average_amount: -3400, last_amount: -2900, first_date: iso(start), last_date: iso(addDays(today, -8)), predicted_next_date: iso(addDays(today, 7)), status: "MATURE", is_active: true, pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES", transaction_ids: [], user_marked_cancelled: false });

  const net_worth_snapshots = [];
  for (let i = 120; i >= 1; i--) {
    const netWorth = 21400 + (120 - i) * 38 + Math.sin(i / 6) * 420;
    net_worth_snapshots.push({ id: uuid("nw"), date: iso(addDays(today, -i)), total_assets: money(netWorth + 9900), total_liabilities: 9900, net_worth: money(netWorth) });
  }

  return {
    items,
    accounts,
    transactions,
    manual_accounts,
    manual_transactions,
    recurring_streams,
    net_worth_snapshots,
    manual_subscriptions: [
      { id: uuid("ms"), name: "Snapchat+", amount: 1.99, frequency: "MONTHLY", next_billing_date: iso(addDays(today, 29)), notes: null, is_active: true },
    ],
    manual_assets: [
      { id: uuid("ma"), name: "2019 Honda Civic", category: "vehicle", value: 14500, is_liability: false, notes: null },
      { id: uuid("ma"), name: "Student loan", category: "other", value: 8200, is_liability: true, notes: null },
    ],
    precious_metal_holdings: [{ id: uuid("pm"), metal: "gold", weight: 2, weight_unit: "oz", purity: 0.9167, notes: null }],
    metal_prices: [
      { metal: "gold", price_per_troy_oz_usd: 2650, fetched_at: hoursAgo(5), source: "test" },
      { metal: "silver", price_per_troy_oz_usd: 31, fetched_at: hoursAgo(5), source: "test" },
    ],
    budgets: [
      { id: uuid("bg"), category: "FOOD_AND_DRINK", monthly_amount: 600 },
      { id: uuid("bg"), category: "TRANSPORTATION", monthly_amount: 250 },
      { id: uuid("bg"), category: "GENERAL_MERCHANDISE", monthly_amount: 300 },
      { id: uuid("bg"), category: "ENTERTAINMENT", monthly_amount: 60 },
    ],
    savings_goals: [
      { id: uuid("sg"), name: "Emergency fund", target_amount: 20000, saved_amount: 0, target_date: null, account_id: null, account_refs: [IDS.savings] },
      { id: uuid("sg"), name: "Japan trip", target_amount: 4500, saved_amount: 1200, target_date: iso(addDays(today, 240)), account_id: null, account_refs: [] },
    ],
    alert_events: [
      { id: uuid("ae"), dedupe_key: "renewal:plaid:x", kind: "renewal", title: "Netflix renews in 3 days", body: "About $15.49 expected.", created_at: hoursAgo(20) },
      { id: uuid("ae"), dedupe_key: "budget-warning:FOOD", kind: "budget-warning", title: "Food & Drink budget is 84% used", body: "$504.00 of $600.00 spent, $96.00 left.", created_at: hoursAgo(50) },
    ],
    merchant_rules: [{ id: uuid("mr"), match_text: "PARKVIEW", rename_to: "Rent", category: null, created_at: "2025-06-01T12:00:00Z" }],
    transaction_overrides: [],
    ui_preferences: [],
    webhook_events: [],
  };
}

export const TEST_USER = {
  id: "99999999-0000-4000-8000-000000000001",
  email: "tester@ledger.test",
};
