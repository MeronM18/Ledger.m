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
// From the site's own muted palette: money coming in is its soft sky blue,
// what's kept its sage green (the same green income has everywhere else).
const INCOME_COLOR = "var(--cat-travel)";
const SAVINGS_COLOR = "var(--cat-income)";

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

// ---- Treemap ----------------------------------------------------------------

export type TreeTile = { id: string; label: string; amount: number; color: string; children: { id: string; label: string; amount: number }[] };

/** Where the money went, for the treemap: Savings and each category, each with its finer categories. */
export function treemapTiles(report: CashFlowReport): TreeTile[] {
  const tiles = report.nodes
    .filter((n) => n.column === 2)
    .map((n) => ({
      id: n.id,
      label: n.label,
      amount: n.amount,
      color: n.color,
      children: report.flows
        .filter((f) => f.source === n.id)
        .map((f) => {
          const child = report.nodes.find((c) => c.id === f.target)!;
          return { id: child.id, label: child.label, amount: child.amount };
        }),
    }));
  return tiles.sort((a, b) => b.amount - a.amount);
}

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Squarified treemap layout (Bruls, Huizing and van Wijk): lays `values`
 * (largest first gives the best result) into the rectangle as tiles as
 * close to square as it can, each tile's area in proportion to its value.
 * Returns one rectangle per value, in the same order.
 */
export function squarify(values: number[], box: Rect): Rect[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  const out: Rect[] = values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  if (total <= 0 || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  const areas = values.map((v) => Math.max(0, v) * scale);

  let { x, y, w, h } = box;
  let i = 0;
  // The worst (least square) aspect ratio of a row laid along a side of `side`.
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((s, a) => s + a, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]);
      j++;
    }
    const sum = row.reduce((s, a) => s + a, 0);
    if (w >= h) {
      // A column down the left of what's left.
      const colW = h > 0 ? sum / h : 0;
      let cy = y;
      row.forEach((a, k) => {
        const th = colW > 0 ? a / colW : 0;
        out[i + k] = { x, y: cy, w: colW, h: th };
        cy += th;
      });
      x += colW;
      w -= colW;
    } else {
      // A row along the top of what's left.
      const rowH = w > 0 ? sum / w : 0;
      let cx = x;
      row.forEach((a, k) => {
        const tw = rowH > 0 ? a / rowH : 0;
        out[i + k] = { x: cx, y, w: tw, h: rowH };
        cx += tw;
      });
      y += rowH;
      h -= rowH;
    }
    i = j;
  }
  return out;
}

// ---- Monthly ----------------------------------------------------------------

export type MonthColumn = {
  month: string; // YYYY-MM
  label: string; // "Sep '26"
  income: number;
  expenses: number;
  // Spending by category key (the largest few, the rest under "__rest__").
  byCategory: Record<string, number>;
};

export type MonthlyCashFlow = {
  months: MonthColumn[];
  // The categories stacked, bottom to top, with their labels and colors.
  series: { key: string; label: string; color: string }[];
};

const MAX_SERIES = 7;

/** The months to chart for a period: its own months when it spans half a year or more, else the 12 ending with it. */
export function monthsFor(range: DateRange, todayIso: string, earliest: string | null): string[] {
  const endIso = range.end && range.end < todayIso ? range.end : todayIso;
  const startIso = range.start ?? earliest ?? endIso;
  const toIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const end = toIndex(endIso);
  let start = toIndex(startIso);
  if (end - start + 1 < 6) start = end - 11;
  start = Math.max(start, end - 35, earliest ? toIndex(earliest) : start);
  const out: string[] = [];
  for (let m = start; m <= end; m++) out.push(`${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`);
  return out;
}

/** Each month's income and its spending by category, for the stacked bars. */
export function monthlyCashFlow(
  transactions: SpendingTransaction[],
  connectedCardIssuers: string[],
  months: string[]
): MonthlyCashFlow {
  const wanted = new Set(months);
  const income = new Map<string, number>();
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    if (!wanted.has(m) || t.pending || effectiveCategory(t) !== "INCOME") continue;
    income.set(m, (income.get(m) ?? 0) - t.amount);
  }
  const spending = filterSpendingTransactions(
    transactions.filter((t) => wanted.has(t.date.slice(0, 7))),
    connectedCardIssuers
  );
  const cells = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const t of spending) {
    const m = t.date.slice(0, 7);
    const key = displayCategoryKey(t);
    const row = cells.get(m) ?? new Map<string, number>();
    row.set(key, (row.get(key) ?? 0) + t.amount);
    cells.set(m, row);
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  const ranked = Array.from(totals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  const shown = ranked.length > MAX_SERIES ? ranked.slice(0, MAX_SERIES - 1) : ranked;
  const hasRest = ranked.length > shown.length;

  return {
    series: [
      ...shown.map((key) => ({
        key,
        label: key === "OTHER" ? "Other" : humanizeCategory(key),
        color: `var(--viz-${categoryColorSlot(key) ?? OTHER_CATEGORY_COLOR_SLOT})`,
      })),
      ...(hasRest ? [{ key: "__rest__", label: "Everything else", color: `var(--viz-${OTHER_CATEGORY_COLOR_SLOT})` }] : []),
    ],
    months: months.map((m) => {
      const row = cells.get(m) ?? new Map<string, number>();
      const byCategory: Record<string, number> = {};
      for (const [key, value] of row) {
        // A month where refunds outweigh a category's charges draws nothing for it.
        if (value <= 0) continue;
        const into = shown.includes(key) ? key : "__rest__";
        byCategory[into] = round((byCategory[into] ?? 0) + value);
      }
      const expenses = round(Array.from(row.values()).reduce((s, v) => s + v, 0));
      return {
        month: m,
        label: new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", " '"),
        income: round(Math.max(0, income.get(m) ?? 0)),
        expenses,
        byCategory,
      };
    }),
  };
}
