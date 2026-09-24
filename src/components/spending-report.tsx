"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, ChartBarBig, ChartPie, ChevronDown, Download, SlidersHorizontal, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
            value === o.value ? "bg-bone/12 text-bone ring-1 ring-bone/10 ring-inset hover:bg-bone/16" : "text-muted-foreground hover:bg-bone/6 hover:text-bone"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The donut, drawn directly so a slice can pop out smoothly: 240px square,
// a ring between these radii, with a hair of space between slices.
const SIZE = 240;
const C = SIZE / 2;
const R_OUT = 108;
const R_IN = 74;
const GAP = 0.012; // radians between slices

function arc(start: number, end: number, rOut: number, rIn: number): string {
  const p = (r: number, a: number) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return `M${p(rOut, start)}A${rOut} ${rOut} 0 ${large} 1 ${p(rOut, end)}L${p(rIn, end)}A${rIn} ${rIn} 0 ${large} 0 ${p(rIn, start)}Z`;
}

/**
 * The spending donut. The slice in focus (pointed at here or in the legend,
 * or picked) lifts out and the rest fade back; its name, amount and share
 * show in the middle.
 */
function Donut({
  slices,
  total,
  gross,
  focus,
  onHover,
  onSelect,
}: {
  slices: BreakdownItem[];
  // The net spent (in the middle), and what the slices add up to (their shares).
  total: number;
  gross: number;
  focus: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
}) {
  const shown = focus ? (slices.find((s) => s.key === focus) ?? null) : null;
  const gap = slices.length > 1 ? GAP : 0;
  // Where each slice starts, going round from the top.
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((sum, s) => sum + (gross > 0 ? (s.amount / gross) * Math.PI * 2 : 0), 0));
  return (
    <div className="relative mx-auto size-[240px] shrink-0" onMouseLeave={() => onHover(null)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full overflow-visible" role="img" aria-label="Spending by share">
        {slices.map((s, i) => {
          const sweep = gross > 0 ? (s.amount / gross) * Math.PI * 2 : 0;
          const start = starts[i] + gap / 2;
          // A single slice is a whole ring: stop a hair short so the arc still draws.
          const end = Math.min(start + Math.PI * 2 - 0.0005, Math.max(start + 0.001, starts[i] + sweep - gap / 2));
          const active = focus === s.key;
          const dimmed = focus !== null && !active;
          const clickable = s.key !== EVERYTHING_ELSE;
          return (
            <path
              key={s.key}
              d={arc(start, end, R_OUT, R_IN)}
              fill={vizColor(s.colorSlot)}
              onMouseEnter={() => onHover(s.key)}
              onClick={() => clickable && onSelect(s.key)}
              className={cn("outline-none", clickable && "cursor-pointer")}
              style={{
                transformOrigin: `${C}px ${C}px`,
                transform: active ? "scale(1.07)" : "scale(1)",
                opacity: dimmed ? 0.28 : 1,
                filter: active ? `drop-shadow(0 0 10px color-mix(in oklab, ${vizColor(s.colorSlot)} 45%, transparent))` : "none",
                transition: "transform 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease, filter 260ms ease",
              }}
            >
              <title>{`${s.label}: ${formatCurrency(s.amount, "USD")} (${pct(s.amount, gross)})`}</title>
            </path>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {shown ? (
          <>
            <span className="flex max-w-[8.5rem] items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: vizColor(shown.colorSlot) }} />
              <span className="truncate">{shown.label}</span>
            </span>
            <Money amount={shown.amount} currency="USD" tone="neutral" className="text-lg font-semibold" />
            <span className="text-xs text-muted-foreground">{pct(shown.amount, gross)} of spending</span>
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
  focus,
  onHover,
  onSelect,
}: {
  items: BreakdownItem[];
  total: number;
  selected: string | null;
  focus: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3" onMouseLeave={() => onHover(null)}>
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            onClick={() => onSelect(i.key)}
            onMouseEnter={() => onHover(i.key)}
            onFocus={() => onHover(i.key)}
            onBlur={() => onHover(null)}
            aria-pressed={selected === i.key}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-[background-color,opacity] duration-200",
              focus === i.key && "bg-muted",
              focus !== null && focus !== i.key && "opacity-45"
            )}
          >
            <span
              className={cn("mt-1.5 size-2 shrink-0 rounded-full transition-transform duration-200", focus === i.key && "scale-150")}
              style={{ backgroundColor: vizColor(i.colorSlot) }}
              aria-hidden
            />
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

/** Refunds and credits that don't come off any one slice (a waiver, by merchant), taken off the total. */
function Credits({ credits }: { credits: number }) {
  if (credits >= 0) return null;
  return (
    <p className="px-2 text-xs text-muted-foreground">
      Less <span className="font-mono text-moss tabular-nums">{formatCurrency(-credits, "USD")}</span> in refunds and credits, taken off the total.
    </p>
  );
}

function Bars({
  items,
  selected,
  focus,
  onHover,
  onSelect,
  total,
}: {
  items: BreakdownItem[];
  selected: string | null;
  focus: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
  total: number;
}) {
  const max = items[0]?.amount ?? 1;
  return (
    <ul className="flex flex-col gap-1" onMouseLeave={() => onHover(null)}>
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            onClick={() => onSelect(i.key)}
            onMouseEnter={() => onHover(i.key)}
            aria-pressed={selected === i.key}
            className={cn(
              "grid w-full grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-[background-color,opacity] duration-200 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem]",
              focus === i.key && "bg-muted",
              focus !== null && focus !== i.key && "opacity-45"
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
  // The slice pointed at, in the donut, the legend or the bars; the picked one otherwise.
  const [hovered, setHovered] = useState<string | null>(null);
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
  const { items, gross, credits, total } = useMemo(() => breakdown(inPeriod, by), [inPeriod, by]);
  const slices = donutSlices(items, LEGEND_LIMIT);
  const legend = showAll ? items : items.slice(0, LEGEND_LIMIT);
  const selectedItem = selected ? items.find((i) => i.key === selected) : undefined;
  // Everything else stands in for the smaller ones folded into it.
  const inDonut = (key: string | null) => (key && !slices.some((sl) => sl.key === key) && items.some((i) => i.key === key) ? EVERYTHING_ELSE : key);
  const focus = hovered ?? selected;

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
                <Donut slices={slices} total={total} gross={gross} focus={inDonut(focus)} onHover={setHovered} onSelect={select} />
                <div className="flex w-full min-w-0 flex-col gap-2">
                  <Legend items={legend} total={gross} selected={selected} focus={focus} onHover={setHovered} onSelect={select} />
                  <Credits credits={credits} />
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
                <Bars items={legend} selected={selected} focus={focus} onHover={setHovered} onSelect={select} total={gross} />
                <Credits credits={credits} />
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
