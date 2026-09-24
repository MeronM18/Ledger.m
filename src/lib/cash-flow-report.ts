// Pure. Reports → Cash flow: where the money came from and where it went
// over a period, as totals (income, expenses, net, savings rate) and as the
// flows of a Sankey diagram: each income source into Income, and Income out
// to Savings and each spending category, each category splitting into its
// finer categories.
//
// Income is money in categorized as income (posted). Expenses are spending
// exactly as Budgets and the Spending report count it. Refunds that don't
// come off any one category (a waived fee) come in on the left as "Refunds
// and credits", and a period that spent more than came in draws the
// difference from "Savings used", so the diagram always balances.

import { categoryColorSlot, humanizeCategory, OTHER_CATEGORY_COLOR_SLOT } from "@/lib/plaid-categories";
import { displayCategoryKey, filterSpendingTransactions, type SpendingTransaction } from "@/lib/spending-aggregation";
import { inRange, type DateRange } from "@/lib/spending-report";
import { effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

export type FlowNode = {
  id: string;
  label: string;
  // 0: income sources, 1: Income, 2: Savings and categories, 3: finer categories.
  column: 0 | 1 | 2 | 3;
  amount: number;
  // A CSS color for its bar and the flows leaving it.
  color: string;
};

export type Flow = { source: string; target: string; amount: number };

export type CashFlowReport = {
  income: number;
  expenses: number;
  net: number;
  // Net as a share of income; null with no income.
  savingsRate: number | null;
  nodes: FlowNode[];
  flows: Flow[];
};

const MAX_SOURCES = 5;
const MAX_CATEGORIES = 8;
const MAX_SUBCATEGORIES = 4;

const round = (n: number) => Math.round(n * 100) / 100;
// Money coming in is teal, what's kept is green, like Monarch's.
const INCOME_COLOR = "#2fa7c4";
const SAVINGS_COLOR = "#5cb86a";

/** "Restaurant" for FOOD_AND_DRINK_RESTAURANT: the finer category, without its parent's name. */
export function detailedLabel(category: string, detailed: string | null | undefined): string | null {
  if (!detailed || !detailed.startsWith(`${category}_`)) return null;
  return humanizeCategory(detailed.slice(category.length + 1));
}

/** The largest `max - 1` entries and the rest together under `restLabel`. */
function topWithRest(entries: [string, number][], max: number, restKey: string): [string, number][] {
  const sorted = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max - 1).reduce((s, [, v]) => s + v, 0);
  return [...sorted.slice(0, max - 1), [restKey, rest]];
}

/** Entries sharing a name (an "Other" and the rest folded into "Other") as one. */
function mergeSame(entries: [string, number][]): [string, number][] {
  const merged = new Map<string, number>();
  for (const [k, v] of entries) merged.set(k, (merged.get(k) ?? 0) + v);
  return Array.from(merged);
}

export function cashFlowReport(
  transactions: (SpendingTransaction & { id?: string })[],
  connectedCardIssuers: string[],
  range: DateRange
): CashFlowReport {
  const inPeriod = transactions.filter((t) => inRange(t.date, range));

  // Where it came from.
  const sources = new Map<string, number>();
  for (const t of inPeriod) {
    if (t.pending || effectiveCategory(t) !== "INCOME") continue;
    const name = humanizeTransactionName(t);
    sources.set(name, (sources.get(name) ?? 0) - t.amount);
  }
  // A source that netted below zero (income reversed) isn't a source.
  const income = round(Array.from(sources.values()).reduce((s, v) => s + Math.max(0, v), 0));

  // Where it went.
  const spending = filterSpendingTransactions(inPeriod, connectedCardIssuers);
  const byCategory = new Map<string, { total: number; sub: Map<string, number> }>();
  for (const t of spending) {
    const key = displayCategoryKey(t);
    const entry = byCategory.get(key) ?? { total: 0, sub: new Map<string, number>() };
    entry.total += t.amount;
    // A charge with no finer category (entered by hand, say) is its category's "Other".
    const sub = detailedLabel(key, t.pfc_detailed) ?? "Other";
    entry.sub.set(sub, (entry.sub.get(sub) ?? 0) + t.amount);
    byCategory.set(key, entry);
  }
  const expenses = round(Array.from(byCategory.values()).reduce((s, c) => s + c.total, 0));
  // Refunds a category can't absorb (it netted below zero).
  const credits = round(-Array.from(byCategory.values()).reduce((s, c) => s + Math.min(0, c.total), 0));
  const net = round(income - expenses);

  const nodes: FlowNode[] = [];
  const flows: Flow[] = [];
  const add = (node: FlowNode) => nodes.push({ ...node, amount: round(node.amount) });

  // Left: each source (the largest few, the rest as Other income), then
  // credits, then savings drawn on when more went out than came in.
  for (const [name, amount] of topWithRest(Array.from(sources), MAX_SOURCES, "Other income")) {
    add({ id: `source:${name}`, label: name, column: 0, amount, color: INCOME_COLOR });
    flows.push({ source: `source:${name}`, target: "income", amount: round(amount) });
  }
  if (credits > 0) {
    add({ id: "source:credits", label: "Refunds and credits", column: 0, amount: credits, color: INCOME_COLOR });
    flows.push({ source: "source:credits", target: "income", amount: credits });
  }
  if (net < 0) {
    add({ id: "source:savings-used", label: "Savings used", column: 0, amount: -net, color: "var(--oxblood)" });
    flows.push({ source: "source:savings-used", target: "income", amount: round(-net) });
  }

  const inflow = round(flows.reduce((s, f) => s + f.amount, 0));
  if (inflow <= 0) return { income, expenses, net, savingsRate: null, nodes: [], flows: [] };
  add({ id: "income", label: "Income", column: 1, amount: inflow, color: INCOME_COLOR });

  if (net > 0) {
    add({ id: "savings", label: "Savings", column: 2, amount: net, color: SAVINGS_COLOR });
    flows.push({ source: "income", target: "savings", amount: net });
  }

  const categories = topWithRest(
    Array.from(byCategory, ([key, c]) => [key, c.total] as [string, number]),
    MAX_CATEGORIES,
    "__rest__"
  );
  for (const [key, amount] of categories) {
    const label = key === "__rest__" ? "Everything else" : key === "OTHER" ? "Other" : humanizeCategory(key);
    const color = `var(--viz-${key === "__rest__" ? OTHER_CATEGORY_COLOR_SLOT : (categoryColorSlot(key) ?? OTHER_CATEGORY_COLOR_SLOT)})`;
    const id = `category:${key}`;
    add({ id, label, column: 2, amount, color });
    flows.push({ source: "income", target: id, amount: round(amount) });

    // Its finer categories, when there's more than the category itself.
    const sub = key === "__rest__" ? undefined : byCategory.get(key)?.sub;
    const parts = sub ? mergeSame(topWithRest(Array.from(sub), MAX_SUBCATEGORIES, "Other")) : [];
    if (parts.length > 1 || (parts.length === 1 && parts[0][0] !== "Other")) {
      // Refunds inside the category come off its finer parts pro rata, so they add up to it.
      const partsTotal = parts.reduce((s, [, v]) => s + v, 0);
      for (const [subLabel, subAmount] of parts) {
        const share = round((subAmount / partsTotal) * amount);
        if (share <= 0) continue;
        const subId = `sub:${key}:${subLabel}`;
        add({ id: subId, label: subLabel, column: 3, amount: share, color });
        flows.push({ source: id, target: subId, amount: share });
      }
    }
  }

  return { income, expenses, net, savingsRate: income > 0 ? net / income : null, nodes, flows };
}
