"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, Download, SlidersHorizontal, X } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Money } from "@/components/money";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { IncomeKind } from "@/lib/income";
import {
  filtersOn,
  incomeReport,
  NO_FILTERS,
  runningTotals,
  type IncomeEntry,
  type IncomeFilters,
  type IncomeMonthRow,
  type SpendingPoint,
} from "@/lib/income-report";
import { monthSpanLabel, PERIOD_PRESETS, periodRange, rangeLabel } from "@/lib/spending-report";
import { cn } from "@/lib/utils";

const KIND: Record<IncomeKind, { label: string; plural: string; color: string }> = {
  paycheck: { label: "Paycheck", plural: "Paychecks", color: "var(--moss)" },
  interest: { label: "Interest", plural: "Interest", color: "var(--champagne)" },
  other: { label: "Other", plural: "Other income", color: "var(--ash-grey)" },
};
const KINDS: IncomeKind[] = ["paycheck", "interest", "other"];

const monthLong = (m: string, withYear = true) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const barMonth = (m: string, withYear: boolean) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + (withYear ? ` ’${m.slice(2, 4)}` : "");
const shortDay = (iso: string, todayIso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(iso.slice(0, 4) === todayIso.slice(0, 4) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
const pct = (share: number) => `${Math.round(share * 100)}%`;

const tooltipStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  padding: "8px 10px",
};

/** "↑ $9,120 (12%)": up is good news for income. */
function Change({ now, before }: { now: number; before: number }) {
  const diff = now - before;
  if (Math.abs(diff) < 0.005) return <span className="text-muted-foreground">No change</span>;
  const up = diff > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono tabular-nums", up ? "text-moss" : "text-oxblood-text")}>
      <Arrow className="size-3.5" aria-label={up ? "Up" : "Down"} />
      {formatCurrency(Math.abs(diff), "USD")}
      {before > 0 ? ` (${pct(Math.abs(diff) / before)})` : ""}
    </span>
  );
}

/** Each month's income stacked by kind, spending over it for the whole picture; the compared month stands out. */
function MonthsChart({ months, highlight, average, thisMonth }: { months: IncomeMonthRow[]; highlight: string; average: number | null; thisMonth: string }) {
  const data = months.map((m, i) => ({ ...m, label: barMonth(m.month, i === 0 || m.month.endsWith("-01")) }));
  const whole = months.some((m) => m.spending !== null);
  return (
    <ResponsiveContainer {...CHART_RESIZE} width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={(v: number) => formatCompactCurrency(v, "USD")} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          {...chartTooltipProps}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={({ active, payload }) => {
            const m = payload?.[0]?.payload as IncomeMonthRow | undefined;
            if (!active || !m) return null;
            return (
              <div style={tooltipStyle}>
                <p className="mb-1 text-bone">
                  {monthLong(m.month)}
                  {m.month === thisMonth ? " (so far)" : ""}
                </p>
                {[
                  ...KINDS.filter((k) => m[k] !== 0).map((k) => [KIND[k].plural, m[k]] as const),
                  ["Income", m.income] as const,
                  ...(m.spending !== null ? ([["Spending", m.spending]] as const) : []),
                  ...(m.kept !== null ? ([["Kept", m.kept]] as const) : []),
                ].map(([name, v]) => (
                  <p key={name} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(v, "USD")}</span>
                  </p>
                ))}
              </div>
            );
          }}
        />
        {average !== null && average > 0 && <ReferenceLine y={average} stroke="var(--ash-grey)" strokeDasharray="4 4" />}
        {KINDS.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="income" name={KIND[k].plural} maxBarSize={36} radius={i === KINDS.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false}>
            {data.map((m) => (
              <Cell key={m.month} fill={KIND[k].color} fillOpacity={m.month === highlight ? 1 : m.complete ? 0.7 : 0.4} />
            ))}
          </Bar>
        ))}
        {whole && (
          <Line
            type="monotone"
            dataKey="spending"
            name="Spending"
            stroke="var(--oxblood-text)"
            strokeWidth={1.75}
            dot={{ r: 2.5, fill: "var(--oxblood-text)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** This year's income added up month by month, over last year's. */
function RunningChart({ run, year }: { run: NonNullable<ReturnType<typeof runningTotals>>; year: number }) {
  const data = run.map((r) => ({ ...r, label: MONTH_ABBR[r.month - 1] }));
  return (
    <ResponsiveContainer {...CHART_RESIZE} width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tickFormatter={(v: number) => formatCompactCurrency(v, "USD")} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          {...chartTooltipProps}
          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            const r = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!active || !r) return null;
            return (
              <div style={tooltipStyle}>
                <p className="mb-1 text-bone">Through {new Date(Date.UTC(year, r.month - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}</p>
                {r.thisYear !== null && (
                  <p className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{year}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(r.thisYear, "USD")}</span>
                  </p>
                )}
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{year - 1}</span>
                  <span className="font-mono tabular-nums">{formatCurrency(r.lastYear ?? 0, "USD")}</span>
                </p>
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="lastYear" name={String(year - 1)} stroke="var(--ash-grey)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="thisYear" name={String(year)} stroke="var(--moss)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const SHOWN_DEPOSITS = 25;

/**
 * Reports → Income: any period and any slice of it. The total and how it
 * compares, what kind it was, each month, this year against last, where it
 * came from, the paychecks, every month side by side and every deposit.
 */
export function IncomeReport({
  entries,
  spending,
  accounts,
  todayIso,
  countOn,
}: {
  entries: IncomeEntry[];
  spending: SpendingPoint[];
  // Accounts income landed in, by id, as labels.
  accounts: { id: string; label: string }[];
  todayIso: string;
  // "What you can count on", worked out from the last 12 full months whatever the filters.
  countOn: React.ReactNode;
}) {
  const [period, setPeriod] = useState("last-12-months");
  const [filters, setFilters] = useState<IncomeFilters>(NO_FILTERS);
  const [showAll, setShowAll] = useState(false);

  const range = useMemo(() => periodRange(period, todayIso), [period, todayIso]);
  const r = useMemo(() => incomeReport(entries, spending, range, filters, todayIso), [entries, spending, range, filters, todayIso]);
  const run = useMemo(() => runningTotals(entries, filters, todayIso), [entries, filters, todayIso]);
  const monthsWithIncome = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.date.slice(0, 7))))
        .sort((a, b) => b.localeCompare(a))
        .map((m) => ({ value: m, label: monthLong(m) })),
    [entries]
  );
  const sourceNames = useMemo(() => Array.from(new Set(entries.map((e) => e.source))).sort((a, b) => a.localeCompare(b)), [entries]);
  const accountLabel = useMemo(() => new Map(accounts.map((a) => [a.id, a.label])), [accounts]);

  const earliest = monthsWithIncome.at(-1)?.value;
  const periodLabel = rangeLabel(range, todayIso, earliest ? `${earliest}-01` : null);
  const whole = !filtersOn(filters);
  const moreFilters = Number(filters.source !== null) + Number(filters.accountId !== "all");
  const thisMonth = todayIso.slice(0, 7);
  const year = Number(todayIso.slice(0, 4));
  const deposits = showAll ? r.entries : r.entries.slice(0, SHOWN_DEPOSITS);
  const lastCheck = r.entries.find((e) => e.kind === "paycheck" && e.amount > 0) ?? null;
  const tableMonths = [...r.months].reverse();
  const kindsInPeriod = KINDS.filter((k) => r.byKind[k] !== 0);

  function set(next: Partial<IncomeFilters>) {
    setFilters((f) => ({ ...f, ...next }));
    setShowAll(false);
  }

  function exportCsv() {
    const rows = r.entries.map((e) => [e.date, e.source, KIND[e.kind].label, e.accountId ? (accountLabel.get(e.accountId) ?? "") : "Cash / Manual", e.amount.toFixed(2)]);
    downloadCsv(`ledger-income-${todayIso}.csv`, toCsv(["Date", "Source", "Kind", "Account", "Amount"], rows));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Segmented
          label="Kind"
          value={filters.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: "all", label: "All income" },
            { value: "paycheck", label: "Paychecks" },
            { value: "interest", label: "Interest" },
            { value: "other", label: "Other" },
          ]}
        />
        <Select value={period} onValueChange={setPeriod}>
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
              {monthsWithIncome.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" aria-label={moreFilters > 0 ? `Filters (${moreFilters} on)` : "Filters"}>
              <SlidersHorizontal className="size-3.5" />
              Filters
              {moreFilters > 0 && <span className="ml-0.5 rounded-full bg-champagne px-1.5 font-mono text-[10px] leading-4 text-onyx tabular-nums">{moreFilters}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="income-source" className="text-xs font-normal text-muted-foreground">
                Source
              </Label>
              <Select value={filters.source ?? "all"} onValueChange={(v) => set({ source: v === "all" ? null : v })}>
                <SelectTrigger id="income-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  <SelectItem value="all">Every source</SelectItem>
                  {sourceNames.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="income-account" className="text-xs font-normal text-muted-foreground">
                Landed in
              </Label>
              <Select value={filters.accountId} onValueChange={(accountId) => set({ accountId })}>
                <SelectTrigger id="income-account" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">Any account</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="ghost" className="self-end" disabled={!filtersOn(filters)} onClick={() => set(NO_FILTERS)}>
              Reset
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* The total, and how the period compares. */}
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">
                {filters.kind === "all" ? "Total income" : KIND[filters.kind].plural}
                {filters.source && <> from {filters.source}</>}
                {filters.accountId !== "all" && <> into {accountLabel.get(filters.accountId)}</>}
                <span className="text-muted-foreground/80"> · {periodLabel}</span>
              </p>
              <Money amount={r.total} currency="USD" tone="positive" className="text-4xl font-semibold" />
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                {r.previous && (r.previous.total > 0 || r.total > 0) ? (
                  <>
                    {r.previous.total > 0 ? <Change now={r.total} before={r.previous.total} /> : <span className="text-moss">New</span>}
                    <span className="text-muted-foreground">
                      {r.previous.total > 0 ? "against" : "nothing came in over"} {rangeLabel(r.previous.range, todayIso, null)}
                      {r.previous.total > 0 && <> ({formatCurrency(r.previous.total, "USD")})</>}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            {filtersOn(filters) && (
              <Button size="sm" variant="ghost" onClick={() => set(NO_FILTERS)}>
                <X className="size-3.5" aria-hidden />
                Show all income
              </Button>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Deposits</dt>
              <dd className="font-mono text-lg tabular-nums">{r.count}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">A typical month</dt>
              <dd className="text-lg">{r.averageMonth !== null ? <Money amount={r.averageMonth} currency="USD" tone="neutral" /> : <span className="text-muted-foreground">—</span>}</dd>
            </div>
            {whole && r.spending !== null && (
              <>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Spent</dt>
                  <dd className="text-lg">
                    <Money amount={r.spending} currency="USD" tone="neutral" />
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Kept</dt>
                  <dd className="text-lg">
                    <Money amount={r.kept ?? 0} currency="USD" tone={(r.kept ?? 0) >= 0 ? "positive" : "negative"} />
                    {r.total > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{pct((r.kept ?? 0) / r.total)} of income</span>}
                  </dd>
                </div>
              </>
            )}
          </dl>

          {filters.kind === "all" && r.total > 0 && kindsInPeriod.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {kindsInPeriod.map((k) => (
                  <span key={k} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${Math.max(0, (r.byKind[k] / r.total) * 100)}%`, backgroundColor: KIND[k].color }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {kindsInPeriod.map((k) => (
                  <li key={k}>
                    <button type="button" onClick={() => set({ kind: k })} className="inline-flex items-center gap-2 transition-colors hover:text-champagne">
                      <span className="size-2 rounded-full" style={{ backgroundColor: KIND[k].color }} aria-hidden />
                      {KIND[k].plural}
                      <Money amount={r.byKind[k]} currency="USD" tone="neutral" className="text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{pct(r.byKind[k] / r.total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Month by month</CardTitle>
            <p className="text-xs text-muted-foreground">{monthSpanLabel(r.months.map((m) => m.month))}</p>
          </div>
          {r.best && (
            <p className="text-xs text-muted-foreground">
              Best {monthLong(r.best.month)} ({formatCurrency(r.best.income, "USD")})
              {r.slowest && <> · slowest {monthLong(r.slowest.month)} ({formatCurrency(r.slowest.income, "USD")})</>}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {r.months.every((m) => m.income === 0) ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No income in these months.</p>
          ) : (
            <MonthsChart months={r.months} highlight={r.highlight} average={r.averageMonth} thisMonth={thisMonth} />
          )}
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground" aria-label="Chart key">
            {KINDS.filter((k) => filters.kind === "all" || filters.kind === k).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: KIND[k].color }} aria-hidden /> {KIND[k].plural}
              </li>
            ))}
            {whole && (
              <li className="flex items-center gap-2">
                <span className="h-0.5 w-4 rounded-full bg-oxblood-text" aria-hidden /> Spending
              </li>
            )}
            {r.averageMonth !== null && (
              <li className="flex items-center gap-2">
                <span className="w-4 border-t border-dashed border-ash-grey" aria-hidden /> Typical month
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {run && (
          <Card>
            <CardHeader className="flex flex-col gap-1">
              <CardTitle>
                {year} against {year - 1}
              </CardTitle>
              {(() => {
                const now = run.find((x) => x.month === Number(todayIso.slice(5, 7)));
                return now && now.thisYear !== null ? (
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <Change now={now.thisYear} before={now.lastYear ?? 0} />
                    <span className="text-muted-foreground">by the end of {monthLong(thisMonth, false)}, running total</span>
                  </p>
                ) : null;
              })()}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <RunningChart run={run} year={year} />
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground" aria-label="Chart key">
                <li className="flex items-center gap-2">
                  <span className="h-0.5 w-4 rounded-full bg-moss" aria-hidden /> {year}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-4 border-t border-dashed border-ash-grey" aria-hidden /> {year - 1}
                </li>
              </ul>
            </CardContent>
          </Card>
        )}
        {countOn}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where it came from</CardTitle>
            <p className="text-xs text-muted-foreground">Pick one to see only it.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {r.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing came in over this period.</p>
            ) : (
              r.sources.map((s) => {
                const on = filters.source === s.source;
                return (
                  <button
                    key={s.source}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ source: on ? null : s.source })}
                    className={cn("flex flex-col gap-1.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50", on && "bg-muted")}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{s.source}</span>
                      <Money amount={s.amount} currency="USD" tone="positive" className="shrink-0 text-sm" />
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, s.share * 100)}%`, backgroundColor: KIND[s.kind].color }} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pct(s.share)} · {s.count} {s.count === 1 ? "deposit" : "deposits"} · {KIND[s.kind].label.toLowerCase()}
                    </span>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paychecks</CardTitle>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </CardHeader>
          <CardContent>
            {r.paychecks.count === 0 ? (
              <p className="text-sm text-muted-foreground">No paychecks in this period.</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm">
                {lastCheck && (
                  <>
                    <dt className="text-muted-foreground">Latest</dt>
                    <dd className="text-right">
                      <Money amount={lastCheck.amount} currency="USD" tone="positive" />
                      <span className="block text-xs text-muted-foreground">{shortDay(lastCheck.date, todayIso)}</span>
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">How many</dt>
                <dd className="text-right font-mono tabular-nums">{r.paychecks.count}</dd>
                {r.paychecks.average !== null && (
                  <>
                    <dt className="text-muted-foreground">Average</dt>
                    <dd className="text-right">
                      <Money amount={r.paychecks.average} currency="USD" tone="positive" />
                    </dd>
                  </>
                )}
                {r.paychecks.largest && (
                  <>
                    <dt className="text-muted-foreground">Largest</dt>
                    <dd className="text-right">
                      <Money amount={r.paychecks.largest.amount} currency="USD" tone="positive" />
                      <span className="block text-xs text-muted-foreground">{shortDay(r.paychecks.largest.date, todayIso)}</span>
                    </dd>
                  </>
                )}
                {r.paychecks.smallest && r.paychecks.count > 1 && (
                  <>
                    <dt className="text-muted-foreground">Smallest</dt>
                    <dd className="text-right">
                      <Money amount={r.paychecks.smallest.amount} currency="USD" tone="positive" />
                      <span className="block text-xs text-muted-foreground">{shortDay(r.paychecks.smallest.date, todayIso)}</span>
                    </dd>
                  </>
                )}
                {r.paychecks.typicalGapDays !== null && (
                  <>
                    <dt className="text-muted-foreground">Usually every</dt>
                    <dd className="text-right">{Math.round(r.paychecks.typicalGapDays)} days</dd>
                  </>
                )}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every month</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-normal">Month</th>
                {filters.kind === "all" &&
                  KINDS.map((k) => (
                    <th key={k} className="hidden pb-2 text-right font-normal md:table-cell">
                      {KIND[k].plural}
                    </th>
                  ))}
                <th className="pb-2 text-right font-normal">Income</th>
                {whole && <th className="pb-2 text-right font-normal">Spending</th>}
                {whole && <th className="pb-2 text-right font-normal">Kept</th>}
              </tr>
            </thead>
            <tbody>
              {tableMonths.map((m) => (
                <tr key={m.month} className={cn("border-t border-border", m.month === r.highlight && "bg-muted/40")}>
                  <td className="py-2.5">
                    {monthLong(m.month)}
                    {!m.complete && <span className="ml-2 text-xs text-muted-foreground">so far</span>}
                  </td>
                  {filters.kind === "all" &&
                    KINDS.map((k) => (
                      <td key={k} className="hidden py-2.5 text-right md:table-cell">
                        <Money amount={m[k]} currency="USD" tone="neutral" className="text-muted-foreground" />
                      </td>
                    ))}
                  <td className="py-2.5 text-right">
                    <Money amount={m.income} currency="USD" tone="positive" />
                  </td>
                  {whole && (
                    <td className="py-2.5 text-right">
                      <Money amount={m.spending ?? 0} currency="USD" tone="neutral" />
                    </td>
                  )}
                  {whole && (
                    <td className="py-2.5 text-right">
                      <Money amount={m.kept ?? 0} currency="USD" tone={(m.kept ?? 0) >= 0 ? "positive" : "negative"} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Deposits</CardTitle>
            <p className="text-xs text-muted-foreground">
              {r.count} over {periodLabel}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="text-champagne hover:text-champagne" onClick={exportCsv} disabled={r.count === 0}>
            <Download className="size-3.5" />
            Download CSV
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col">
          {deposits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing came in over this period.</p>
          ) : (
            <ul className="flex flex-col">
              {deposits.map((e) => (
                <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: KIND[e.kind].color }} aria-hidden />
                      <span className="truncate text-sm font-medium">{e.source}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {shortDay(e.date, todayIso)} · {KIND[e.kind].label} · {e.accountId ? (accountLabel.get(e.accountId) ?? "Account") : "Cash / Manual"}
                    </span>
                  </span>
                  <Money amount={e.amount} currency="USD" tone={e.amount >= 0 ? "positive" : "negative"} showSign className="text-sm font-medium" />
                </li>
              ))}
            </ul>
          )}
          {r.entries.length > SHOWN_DEPOSITS && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 inline-flex items-center gap-1 self-center text-xs text-champagne hover:underline">
              {showAll ? "Show fewer" : `Show all ${r.entries.length}`}
              <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
