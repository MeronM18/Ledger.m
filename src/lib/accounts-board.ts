// Pure. The Accounts page's model: every account and asset as one row,
// grouped by what it is (cash, credit cards, investments, loans, property)
// rather than by bank, each with its balance history (account-history.ts)
// for the net worth line, the trends and each group's change.
//
// Balances follow net worth (net-worth.ts): hidden accounts are left out,
// a card counts what's owed, Apple Savings counts once a balance is entered.

import { accountName, type AccountSettings } from "@/lib/account-settings";
import { addDays, dailyBalances, type HistoryTx } from "@/lib/account-history";
import { formatCurrency } from "@/lib/format";
import { prettyName } from "@/lib/transaction-display";

export type GroupKey = "cash" | "credit" | "investments" | "loans" | "property";

export const GROUPS: { key: GroupKey; label: string; liability: boolean }[] = [
  { key: "cash", label: "Cash", liability: false },
  { key: "credit", label: "Credit cards", liability: true },
  { key: "investments", label: "Investments", liability: false },
  { key: "loans", label: "Loans", liability: true },
  { key: "property", label: "Property and other", liability: false },
];

// What the Summary splits assets and liabilities into.
export type SummaryKind = "Cash" | "Investments" | "Property" | "Vehicles" | "Other" | "Credit cards" | "Loans";

export type RowIcon = "cash" | "vehicle" | "property" | "crypto" | "metals" | "other";

export type BoardRow = {
  id: string;
  group: GroupKey;
  kind: SummaryKind;
  name: string;
  mask: string | null;
  // The line under the name: bank, type, limit, rate.
  detail: string;
  // The bank's name, for its mark; null for things not at a bank.
  institution: string | null;
  icon: RowIcon | null;
  // What it's worth, or for a card or loan what's owed (never negative owed).
  balance: number;
  liability: boolean;
  // Daily balance from the history start through today, oldest first; null
  // for something whose value only changes when you change it.
  series: number[] | null;
  // When the balance was last brought up to date.
  updated: { at: string | null; how: "synced" | "imported" | "entered" | "priced" };
  // Transactions for this account, when it has any.
  transactionsHref: string | null;
  // What the row's buttons act on.
  ref:
    | { type: "plaid"; accountId: string; subtype: string | null; apy: number | null; isCard: boolean }
    | { type: "apple"; manualId: string }
    | { type: "asset"; assetId: string }
    | { type: "metals" };
};

export type PlaidAccountInput = {
  id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  credit_limit: number | null;
  apy: number | null;
  is_hidden?: boolean | null;
  institution: string | null;
  last_synced_at: string | null;
};

export type ManualAccountInput = {
  id: string;
  type: "credit" | "depository";
  name: string;
  institution_name: string;
  mask: string | null;
  credit_limit: number | null;
  apy: number | null;
  balance: number;
  balanceKnown: boolean;
  lastImportedAt: string | null;
};

export type ManualAssetInput = {
  id: string;
  name: string;
  category: "cash" | "crypto" | "vehicle" | "property" | "other";
  value: number;
  is_liability: boolean;
  updated_at?: string | null;
};

export type BoardInput = {
  plaid: PlaidAccountInput[];
  manualAccounts: ManualAccountInput[];
  assets: ManualAssetInput[];
  metals: { value: number; count: number; pricedAt: string | null };
  settings: AccountSettings;
  // Posted transactions by account id (a manual account's as `manual:<id>`).
  transactions: Map<string, HistoryTx[]>;
  todayIso: string;
  historyStart: string;
};

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

const SUBTYPE: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  "money market": "Money market",
  cd: "CD",
  "credit card": "Credit card",
  "cash management": "Cash management",
};

function subtypeLabel(type: string, subtype: string | null): string {
  if (subtype && SUBTYPE[subtype]) return SUBTYPE[subtype];
  if (subtype) return subtype.charAt(0).toUpperCase() + subtype.slice(1);
  return type === "credit" ? "Credit card" : type.charAt(0).toUpperCase() + type.slice(1);
}

function usedOf(balance: number, limit: number | null): string | null {
  if (!limit) return null;
  return `${Math.round((Math.max(0, balance) / limit) * 100)}% of ${formatCurrency(limit, "USD")}`;
}

const join = (parts: (string | number | null | false | undefined)[]) => parts.filter(Boolean).join(" · ");

function plaidGroup(type: string): { group: GroupKey; kind: SummaryKind } {
  if (type === "depository") return { group: "cash", kind: "Cash" };
  if (type === "credit") return { group: "credit", kind: "Credit cards" };
  if (type === "loan") return { group: "loans", kind: "Loans" };
  if (type === "investment" || type === "brokerage") return { group: "investments", kind: "Investments" };
  return { group: "property", kind: "Other" };
}

function assetPlace(a: ManualAssetInput): { group: GroupKey; kind: SummaryKind; icon: RowIcon } {
  if (a.is_liability) return { group: "loans", kind: "Loans", icon: a.category === "vehicle" ? "vehicle" : a.category === "property" ? "property" : "other" };
  switch (a.category) {
    case "cash":
      return { group: "cash", kind: "Cash", icon: "cash" };
    case "crypto":
      return { group: "investments", kind: "Investments", icon: "crypto" };
    case "vehicle":
      return { group: "property", kind: "Vehicles", icon: "vehicle" };
    case "property":
      return { group: "property", kind: "Property", icon: "property" };
    default:
      return { group: "property", kind: "Other", icon: "other" };
  }
}

const ASSET_LABEL: Record<ManualAssetInput["category"], string> = {
  cash: "Cash",
  crypto: "Crypto",
  vehicle: "Vehicle",
  property: "Property",
  other: "Other",
};

/** Every account and asset as a row, in a steady order within each group. */
export function buildBoard(input: BoardInput): BoardRow[] {
  const { settings, todayIso, historyStart } = input;
  const history = (id: string, balance: number, liability: boolean) =>
    dailyBalances(balance, liability ? "liability" : "asset", input.transactions.get(id) ?? [], historyStart, todayIso);

  const rows: BoardRow[] = [];

  for (const a of input.plaid) {
    if (a.is_hidden) continue;
    const { group, kind } = plaidGroup(a.type);
    const liability = group === "credit" || group === "loans";
    const balance = a.current_balance === null ? 0 : Number(a.current_balance);
    const setting = settings[a.id];
    const isCard = a.type === "credit";
    const bank = a.institution ? prettyName(a.institution) : null;
    rows.push({
      id: a.id,
      group,
      kind,
      name: accountName(a, setting),
      mask: a.mask,
      detail: join([
        bank,
        subtypeLabel(a.type, a.subtype),
        a.apy !== null && `${a.apy}% APY`,
        isCard && usedOf(balance, a.credit_limit),
        isCard && setting?.statementCloseDay && `closes the ${ordinal(setting.statementCloseDay)}`,
        isCard && setting?.paymentDueDay && `due the ${ordinal(setting.paymentDueDay)}`,
      ]),
      institution: a.institution,
      icon: null,
      balance,
      liability,
      series: history(a.id, balance, liability),
      updated: { at: a.last_synced_at, how: "synced" },
      transactionsHref: `/transactions?account=${encodeURIComponent(a.id)}`,
      ref: { type: "plaid", accountId: a.id, subtype: a.subtype, apy: a.apy === null ? null : Number(a.apy), isCard },
    });
  }

  for (const m of input.manualAccounts) {
    const isCard = m.type === "credit";
    // A deposit account with no balance entered isn't counted anywhere yet.
    if (!isCard && !m.balanceKnown) continue;
    const balance = isCard ? Math.max(0, m.balance) : m.balance;
    const id = `manual:${m.id}`;
    rows.push({
      id,
      group: isCard ? "credit" : "cash",
      kind: isCard ? "Credit cards" : "Cash",
      name: m.name,
      mask: m.mask,
      detail: join([m.institution_name, isCard ? "Credit card" : "Savings", isCard ? usedOf(balance, m.credit_limit) : m.apy !== null && `${m.apy}% APY`]),
      institution: m.institution_name,
      icon: null,
      balance,
      liability: isCard,
      series: history(id, balance, isCard),
      updated: { at: m.lastImportedAt, how: "imported" },
      transactionsHref: `/transactions?account=${encodeURIComponent(id)}`,
      ref: { type: "apple", manualId: m.id },
    });
  }

  for (const a of input.assets) {
    const place = assetPlace(a);
    rows.push({
      id: `asset:${a.id}`,
      group: place.group,
      kind: place.kind,
      name: a.name,
      mask: null,
      detail: a.is_liability ? `${ASSET_LABEL[a.category]} · owed` : ASSET_LABEL[a.category],
      institution: null,
      icon: place.icon,
      balance: Number(a.value),
      liability: a.is_liability,
      series: null,
      updated: { at: a.updated_at ?? null, how: "entered" },
      transactionsHref: null,
      ref: { type: "asset", assetId: a.id },
    });
  }

  if (input.metals.count > 0) {
    rows.push({
      id: "metals",
      group: "investments",
      kind: "Investments",
      name: "Precious metals",
      mask: null,
      detail: `${input.metals.count} ${input.metals.count === 1 ? "holding" : "holdings"} at today's prices`,
      institution: null,
      icon: "metals",
      balance: input.metals.value,
      liability: false,
      series: null,
      updated: { at: input.metals.pricedAt, how: "priced" },
      transactionsHref: null,
      ref: { type: "metals" },
    });
  }

  return rows;
}

/** Where the history starts: the oldest posted transaction, but no more than `maxDays` back. */
export function historyStartFor(transactions: Map<string, HistoryTx[]>, todayIso: string, maxDays: number): string {
  const floor = addDays(todayIso, -maxDays);
  let earliest = todayIso;
  for (const list of transactions.values()) {
    for (const t of list) if (t.date < earliest) earliest = t.date;
  }
  // The day before the first transaction, so the line starts before it.
  const start = addDays(earliest, -1);
  return start < floor ? floor : start;
}

export type SummaryPart = { kind: SummaryKind; amount: number };

/** Assets and liabilities by kind, largest first, and their totals. */
export function summarize(rows: BoardRow[]): {
  assets: SummaryPart[];
  liabilities: SummaryPart[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
} {
  const assets = new Map<SummaryKind, number>();
  const liabilities = new Map<SummaryKind, number>();
  for (const r of rows) {
    const into = r.liability ? liabilities : assets;
    into.set(r.kind, (into.get(r.kind) ?? 0) + r.balance);
  }
  const parts = (m: Map<SummaryKind, number>) =>
    Array.from(m, ([kind, amount]) => ({ kind, amount: Math.round(amount * 100) / 100 }))
      .filter((p) => p.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
  const totalAssets = Math.round(Array.from(assets.values()).reduce((s, v) => s + v, 0) * 100) / 100;
  const totalLiabilities = Math.round(Array.from(liabilities.values()).reduce((s, v) => s + v, 0) * 100) / 100;
  return {
    assets: parts(assets),
    liabilities: parts(liabilities),
    totalAssets,
    totalLiabilities,
    netWorth: Math.round((totalAssets - totalLiabilities) * 100) / 100,
  };
}

/**
 * Net worth at the end of each day of the history, oldest first: every
 * account's balance that day, with things that have no history at today's
 * value.
 */
export function netWorthSeries(rows: BoardRow[]): number[] {
  const length = Math.max(1, ...rows.map((r) => r.series?.length ?? 1));
  const out = new Array<number>(length).fill(0);
  for (const r of rows) {
    const sign = r.liability ? -1 : 1;
    for (let i = 0; i < length; i++) out[i] += sign * (r.series ? r.series[i] : r.balance);
  }
  return out.map((v) => Math.round(v * 100) / 100);
}
