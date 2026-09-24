"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, ChartBarBig, ChartPie, ChevronDown, Download, SlidersHorizontal, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Money } from "@/components/money";
import { SpendingTrends } from "@/components/spending-trends";
import {
  SummaryLine,
  TransactionDayList,
  TransactionSheet,
  useTransactionPanel,
  type TransactionRow,
} from "@/components/transactions-explorer";
import { accountLabel, MANUAL_ACCOUNT_ID, MANUAL_ACCOUNT_OPTION, type AccountOption } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Card as StatementCard } from "@/lib/card-statements";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { filterSpendingTransactions, monthlyTotals, type SpendingTransaction } from "@/lib/spending-aggregation";
import {
  breakdown,
  breakdownKey,
  donutSlices,
  EVERYTHING_ELSE,
  inRange,
  PERIOD_PRESETS,
  periodRange,
  rangeLabel,
  type BreakdownBy,
  type BreakdownItem,
} from "@/lib/spending-report";
import { categoryChanges, paceComparison, previousMonth, typicalMonth, type MonthRef } from "@/lib/trends";
import { humanizeTransaction, humanizeTransactionName } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

const vizColor = (slot: number) => `var(--viz-${slot})`;
const LEGEND_LIMIT = 12;

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

const pct = (amount: number, total: number) => (total > 0 ? `${((amount / total) * 100).toFixed(1)}%` : "0%");

/** A pair (or more) of buttons where one is on, like a small segmented control. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.title}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 transition-colors",
            value === o.value ? "bg-bone/10 text-bone" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Donut({
  slices,
  total,
  selected,
  onSelect,
}: {
  slices: BreakdownItem[];
  total: number;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover !== null ? slices[hover] : (slices.find((s) => s.key === selected) ?? null);
  return (
    <div className="relative mx-auto size-[240px] shrink-0">
      <ResponsiveContainer {...CHART_RESIZE} width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="amount"
            nameKey="label"
            innerRadius={78}
            outerRadius={112}
            paddingAngle={slices.length > 1 ? 1 : 0}
            strokeWidth={0}
            isAnimationActive={false}
            onMouseEnter={(_: unknown, i: number) => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={(_: unknown, i: number) => slices[i].key !== EVERYTHING_ELSE && onSelect(slices[i].key)}
          >
            {slices.map((s) => (
              <Cell
                key={s.key}
                fill={vizColor(s.colorSlot)}
                className="cursor-pointer outline-none"
                fillOpacity={selected === null || selected === s.key ? 1 : 0.3}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {shown ? (
          <>
            <span className="max-w-[8.5rem] truncate text-xs text-muted-foreground">{shown.label}</span>
            <Money amount={shown.amount} currency="USD" tone="neutral" className="text-lg font-semibold" />
            <span className="text-xs text-muted-foreground">{pct(shown.amount, total)}</span>
          </>
        ) : (
          <>
            <Money amount={total} currency="USD" tone="neutral" className="text-xl font-semibold" />
            <span className="text-xs text-muted-foreground">Total</span>
          </>
        )}
      </div>
    </div>
  );
}

function Legend({
  items,
  total,
  selected,
  onSelect,
}: {
  items: BreakdownItem[];
  total: number;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            onClick={() => onSelect(i.key)}
            aria-pressed={selected === i.key}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
              selected === i.key && "bg-muted",
              selected !== null && selected !== i.key && "opacity-50"
            )}
          >
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: vizColor(i.colorSlot) }} aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{i.label}</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatCurrency(i.amount, "USD")} ({pct(i.amount, total)})
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Bars({
  items,
  selected,
  onSelect,
  total,
}: {
  items: BreakdownItem[];
  selected: string | null;
  onSelect: (key: string) => void;
  total: number;
}) {
  const max = items[0]?.amount ?? 1;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            onClick={() => onSelect(i.key)}
            aria-pressed={selected === i.key}
            className={cn(
              "grid w-full grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem]",
              selected === i.key && "bg-muted",
              selected !== null && selected !== i.key && "opacity-50"
            )}
          >
            <span className="truncate text-sm">{i.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${(i.amount / max) * 100}%`, backgroundColor: vizColor(i.colorSlot) }} />
            </span>
            <span className="text-right font-mono text-xs tabular-nums">
              {formatCurrency(i.amount, "USD")} <span className="text-muted-foreground">({pct(i.amount, total)})</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MonthlyBars({ transactions }: { transactions: SpendingTransaction[] }) {
  const months = monthlyTotals(transactions).slice(-24);
  if (months.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">No spending in this view yet.</p>;
  return (
    <ResponsiveContainer {...CHART_RESIZE} width="100%" height={260}>
      <BarChart data={months}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={12} />
        <YAxis
          tickFormatter={(v: number) => formatCompactCurrency(v, "USD")}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          {...chartTooltipProps}
          formatter={(v) => [formatCurrency(Number(v), "USD"), "Spent"]}
          cursor={{ fill: "var(--muted)" }}
          contentStyle={tooltipContentStyle}
          labelStyle={{ color: "var(--bone)" }}
          itemStyle={{ color: "var(--popover-foreground)" }}
        />
        <Bar dataKey="amount" fill="var(--oxblood)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Reports → Spending: what you spent over a period, by category or by
 * merchant, as a donut or bars, or how it's changed over time; then the
 * transactions behind it and a summary. Picking a category (or merchant)
 * narrows the list to it. Everything follows the same rules as Budgets:
 * posted charges, refunds netted, paid-back shares only, transfers out.
 */
export function SpendingReport({
  transactions,
  connectedCardIssuers,
  accounts,
  cards,
  institutions,
}: {
  transactions: TransactionRow[];
  connectedCardIssuers: string[];
  accounts: AccountOption[];
  cards: StatementCard[];
  institutions: Record<string, string>;
}) {
  const today = todayIso();
  const [period, setPeriod] = useState("this-month");
  const [by, setBy] = useState<BreakdownBy>("category");
  const [view, setView] = useState<"total" | "change">("total");
  const [chart, setChart] = useState<"donut" | "bars">("donut");
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [account, setAccount] = useState("all");
  const [search, setSearch] = useState("");
  const panel = useTransactionPanel();

  const byId = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  // Spending as Budgets counts it; each row's amount is your share.
  const spending = useMemo(
    () => filterSpendingTransactions(transactions, connectedCardIssuers) as (SpendingTransaction & { id: string; account: TransactionRow["account"] })[],
    [transactions, connectedCardIssuers]
  );

  const months = useMemo(() => {
    const present = new Set(spending.map((t) => t.date.slice(0, 7)));
    return Array.from(present)
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({ value: m, label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) }));
  }, [spending]);

  // Account and search apply everywhere; the period only to totals and the list.
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return spending.filter((t) => {
      if (account === MANUAL_ACCOUNT_ID ? t.account !== null : account !== "all" && t.account?.id !== account) return false;
      if (q && !`${humanizeTransactionName(t)} ${t.merchant_name ?? ""} ${t.name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [spending, account, search]);

  const range = useMemo(() => periodRange(period, today), [period, today]);
  const inPeriod = useMemo(() => scoped.filter((t) => inRange(t.date, range)), [scoped, range]);
  const { items, total } = useMemo(() => breakdown(inPeriod, by), [inPeriod, by]);
  const slices = donutSlices(items, LEGEND_LIMIT);
  const legend = showAll ? items : items.slice(0, LEGEND_LIMIT);
  const selectedItem = selected ? items.find((i) => i.key === selected) : undefined;

  // The list: the period's spending, narrowed to the picked category or merchant.
  const listed = useMemo(
    () => (selected ? inPeriod.filter((t) => breakdownKey(t, by) === selected) : inPeriod).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    [inPeriod, selected, by]
  );
  const listRows = listed.map((t) => byId.get(t.id) ?? (t as unknown as TransactionRow));
  const listTotal = Math.round(listed.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const charges = listed.filter((t) => t.amount > 0);
  const largest = charges.reduce<number | null>((m, t) => (m === null || t.amount > m ? t.amount : m), null);
  const refunds = Math.round(listed.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0) * 100) / 100;

  // Change over time: the month the period ends in, against the one before.
  const endMonth = (range.end && range.end < today ? range.end : today).slice(0, 7);
  const monthRef: MonthRef = { year: Number(endMonth.slice(0, 4)), month: Number(endMonth.slice(5, 7)) - 1 };
  const now = new Date(`${today}T00:00:00`);
  const monthName = (m: MonthRef) =>
    new Date(m.year, m.month, 1).toLocaleDateString("en-US", { month: "long", ...(m.year === monthRef.year ? {} : { year: "numeric" as const }) });
  const trendScope = selected && by === "category" ? scoped.filter((t) => breakdownKey(t, "category") === selected) : scoped;
  const overTime = selected ? scoped.filter((t) => breakdownKey(t, by) === selected) : scoped;

  function select(key: string) {
    setSelected((s) => (s === key ? null : key));
  }
  function changeBy(next: BreakdownBy) {
    setBy(next);
    setSelected(null);
    setShowAll(false);
  }

  function exportCsv() {
    const rows = listed.map((t) => {
      const row = byId.get(t.id);
      const { displayName, displayCategoryLabel } = humanizeTransaction(row ?? t);
      return [t.date, displayName, displayCategoryLabel, row?.account ? accountLabel(row.account) : "Cash / Manual", t.amount.toFixed(2)];
    });
    downloadCsv(`ledger-spending-${today}.csv`, toCsv(["Date", "Merchant", "Category", "Account", "Your share"], rows));
  }

  const filtersOn = Number(account !== "all") + Number(search.trim() !== "");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          value={period}
          onValueChange={(v) => {
            setPeriod(v);
            setSelected(null);
          }}
        >
          <SelectTrigger aria-label="Period" className="min-w-40">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end" className="max-h-80">
            <SelectGroup>
              {PERIOD_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>A month</SelectLabel>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" aria-label={filtersOn > 0 ? `Filters (${filtersOn} on)` : "Filters"}>
              <SlidersHorizontal className="size-3.5" />
              Filters
              {filtersOn > 0 && <span className="ml-0.5 rounded-full bg-champagne px-1.5 font-mono text-[10px] leading-4 text-onyx tabular-nums">{filtersOn}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spending-search" className="text-xs font-normal text-muted-foreground">
                Search
              </Label>
              <Input id="spending-search" placeholder="Merchant or description" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spending-account" className="text-xs font-normal text-muted-foreground">
                Account
              </Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger id="spending-account" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">All accounts</SelectItem>
                  {[...accounts, MANUAL_ACCOUNT_OPTION].map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="self-end"
              disabled={filtersOn === 0}
              onClick={() => {
                setAccount("all");
                setSearch("");
              }}
            >
              Reset
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Spending by {by}
            </p>
            <p className="text-base font-medium text-bone">{rangeLabel(range, today, months.length > 0 ? `${months[months.length - 1].value}-01` : null)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={by} onValueChange={(v) => changeBy(v as BreakdownBy)}>
              <SelectTrigger size="sm" aria-label="Group by" className="min-w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value="category">By category</SelectItem>
                <SelectItem value="merchant">By merchant</SelectItem>
              </SelectContent>
            </Select>
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "total", label: "Total amounts" },
                { value: "change", label: "Change over time" },
              ]}
            />
            {view === "total" && (
              <Segmented
                label="Chart"
                value={chart}
                onChange={setChart}
                options={[
                  { value: "donut", label: <ChartPie className="size-3.5" />, title: "Donut" },
                  { value: "bars", label: <ChartBarBig className="size-3.5" />, title: "Bars" },
                ]}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {view === "total" ? (
            items.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No spending in this period.</p>
            ) : chart === "donut" ? (
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
                <Donut slices={slices} total={total} selected={selected} onSelect={select} />
                <div className="flex w-full min-w-0 flex-col gap-2">
                  <Legend items={legend} total={total} selected={selected} onSelect={select} />
                  {items.length > LEGEND_LIMIT && (
                    <button
                      type="button"
                      onClick={() => setShowAll((s) => !s)}
                      className="inline-flex items-center gap-1 self-center text-xs text-champagne hover:underline"
                    >
                      {showAll ? "Show fewer" : `Show all ${items.length} ${by === "category" ? "categories" : "merchants"}`}
                      <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Bars items={legend} selected={selected} onSelect={select} total={total} />
                {items.length > LEGEND_LIMIT && (
                  <button type="button" onClick={() => setShowAll((s) => !s)} className="inline-flex items-center gap-1 self-center text-xs text-champagne hover:underline">
                    {showAll ? "Show fewer" : `Show all ${items.length} ${by === "category" ? "categories" : "merchants"}`}
                    <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Every month{selectedItem ? ` for ${selectedItem.label}` : ""}, up to the last two years.
              </p>
              <MonthlyBars transactions={overTime} />
            </div>
          )}
        </CardContent>
      </Card>

      {view === "change" && (
        <SpendingTrends
          pace={paceComparison(trendScope, monthRef, { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() })}
          monthRef={monthRef}
          changes={categoryChanges(scoped, monthRef)}
          typical={typicalMonth(trendScope, monthRef)}
          monthLabel={monthName(monthRef)}
          previousMonthLabel={monthName(previousMonth(monthRef))}
          currency="USD"
          activeCategory={by === "category" && selected ? selected : "all"}
          onSelectCategory={(c) => {
            setBy("category");
            setSelected(c === "all" ? null : c);
          }}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium text-bone">Transactions</h2>
            {selectedItem && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                {selectedItem.label}
                <X className="size-3.5" aria-label="Clear" />
              </Button>
            )}
          </div>
          <TransactionDayList
            rows={listRows}
            byDate
            institutions={institutions}
            onOpen={panel.open}
            empty="No spending in this period."
            label="Spending transactions"
          />
        </div>

        {/* Level with the list, below its heading. */}
        <div className="lg:sticky lg:top-6 lg:mt-10">
          <Card aria-label="Summary">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="flex flex-col text-sm">
                <SummaryLine label="Total transactions">
                  <span data-testid="summary-count">{listed.length}</span>
                </SummaryLine>
                <SummaryLine label="Largest transaction">{largest !== null ? formatCurrency(largest, "USD") : "—"}</SummaryLine>
                <SummaryLine label="Average transaction">{charges.length > 0 ? formatCurrency(listTotal / charges.length, "USD") : "—"}</SummaryLine>
                {refunds > 0 && (
                  <SummaryLine label="Refunds">
                    <span className="text-moss">+{formatCurrency(refunds, "USD")}</span>
                  </SummaryLine>
                )}
                <SummaryLine label="Total spending">
                  <span data-testid="summary-total">{formatCurrency(listTotal, "USD")}</span>
                </SummaryLine>
              </dl>
              <p className="text-xs text-muted-foreground">
                Posted charges, net of refunds, counting only your share of anything paid back. Transfers and card
                payments aren&apos;t spending.
              </p>
              <Button variant="ghost" size="sm" className="text-champagne hover:text-champagne" onClick={exportCsv} disabled={listed.length === 0}>
                <Download className="size-3.5" />
                Download CSV
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <TransactionSheet
        transaction={panel.openId ? (byId.get(panel.openId) ?? null) : null}
        openKey={panel.openKey}
        onClose={panel.close}
        transactions={transactions}
        cards={cards}
        institutions={institutions}
      />
    </div>
  );
}
