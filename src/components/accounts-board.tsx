"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, X } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  useActiveTooltipDataPoints,
  XAxis,
  YAxis,
} from "recharts";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { Money } from "@/components/money";
import { DragHandle, SortableCardList, type SortableCard } from "@/components/sortable-card-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeOver, daysBetween, PERIODS, thin, type Period } from "@/lib/account-history";
import { breakdownOn, GROUPS, netWorthSeries, summarize, type BoardRow, type GroupKey, type SummaryKind } from "@/lib/accounts-board";
import { applyCardOrder } from "@/lib/card-order";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { dateTicks, dayPoints, formatTickMoney, valueTicks, type DayPoint } from "@/lib/day-chart";
import { formatCurrency, timeAgo } from "@/lib/format";
import { sparklinePath } from "@/lib/net-worth-trend";
import { cn } from "@/lib/utils";

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const fullDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** How many days a period reaches back into a series of `length` days. */
function periodDays(period: Period, length: number): number {
  const days = PERIODS.find((p) => p.value === period)!.days;
  return Math.min(days ?? length - 1, length - 1);
}

function periodPhrase(period: Period, historyStart: string): string {
  if (period === "ALL") return `since ${monthYear(historyStart)}`;
  return `${PERIODS.find((p) => p.value === period)!.label} change`;
}

/** "↑ $1,573.70 (2.5%)", green when it's good news and red when it isn't. */
function Change({ amount, base, liability = false, className }: { amount: number; base?: number; liability?: boolean; className?: string }) {
  if (Math.abs(amount) < 0.005) {
    return <span className={cn("font-mono text-xs text-muted-foreground tabular-nums", className)}>No change</span>;
  }
  const up = amount > 0;
  const good = liability ? !up : up;
  const pct = base && base !== 0 ? ` (${Math.abs((amount / Math.abs(base)) * 100).toFixed(1)}%)` : "";
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-xs tabular-nums", good ? "text-moss" : "text-oxblood-text", className)}>
      <Arrow className="size-3" aria-label={up ? "Up" : "Down"} />
      {formatCurrency(Math.abs(amount), "USD")}
      {pct}
    </span>
  );
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const path = sparklinePath(thin(values, 40), 80, 24);
  if (!path) return <span className={className} />;
  return (
    <svg viewBox="0 0 80 24" className={cn("h-6 w-20 overflow-visible", className)} aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const UPDATED: Record<BoardRow["updated"]["how"], string> = {
  synced: "Synced",
  imported: "Imported",
  entered: "Updated",
  priced: "Priced",
};

function Updated({ updated }: { updated: BoardRow["updated"] }) {
  if (!updated.at) return <>{updated.how === "synced" ? "Never synced" : updated.how === "entered" ? "Entered by you" : ""}</>;
  return <Ago prefix={UPDATED[updated.how]} at={updated.at} />;
}

/** "Synced 2h ago". The server's clock and the browser's can differ by a minute; the browser's wins. */
export function Ago({ prefix, at }: { prefix: string; at: string }) {
  return <span suppressHydrationWarning>{`${prefix} ${timeAgo(at)}`}</span>;
}

// ---- Net worth -------------------------------------------------------------

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

// Inside the chart: tells the panel which day the tooltip is on, so Enter
// can pick it when the chart is driven from the keyboard.
function ActiveDay({ onChange }: { onChange: (point: DayPoint | null) => void }) {
  const points = useActiveTooltipDataPoints<DayPoint>();
  const point = points?.[0] ?? null;
  useEffect(() => onChange(point), [point, onChange]);
  return null;
}

function NetWorthPanel({
  rows,
  series,
  historyStart,
  groupOrder,
  period,
  onPeriod,
}: {
  rows: BoardRow[];
  series: number[];
  historyStart: string;
  groupOrder: GroupKey[];
  period: Period;
  onPeriod: (p: Period) => void;
}) {
  // A day picked on the line, to see what net worth was made of then.
  const [picked, setPicked] = useState<string | null>(null);
  const active = useRef<DayPoint | null>(null);
  const onActive = useCallback((point: DayPoint | null) => {
    active.current = point;
  }, []);
  const pickActive = (e: KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && active.current) {
      e.preventDefault();
      setPicked(active.current.date);
    }
  };
  const days = periodDays(period, series.length);
  const now = series[series.length - 1] ?? 0;
  // Every day, none skipped, so the line and what hovering reads are the
  // balances themselves (two years is only ~730 points).
  const { data, xTicks, xLabel, yTicks } = useMemo(() => {
    const data = dayPoints(series.slice(series.length - 1 - days), addDaysIso(historyStart, series.length - 1 - days));
    const values = data.map((p) => p.value);
    const x = data.length > 1 ? dateTicks(data[0].t, data[data.length - 1].t) : { ticks: [], label: () => "" };
    return { data, xTicks: x.ticks, xLabel: x.label, yTicks: valueTicks(Math.min(...values), Math.max(...values)) };
  }, [series, days, historyStart]);
  const change = now - (data[0]?.value ?? now);
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const lastT = data[data.length - 1]?.t;
  const today = addDaysIso(historyStart, series.length - 1);
  const pickedIndex = picked === null ? null : daysBetween(historyStart, picked);
  const pickedT = picked === null ? null : Date.parse(`${picked}T00:00:00Z`);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Net worth</p>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money amount={now} currency="USD" tone="neutral" className="text-3xl font-semibold" />
            <span className="inline-flex items-baseline gap-1.5">
              <Change amount={change} base={data[0]?.value} className="text-sm" />
              <span className="text-xs text-muted-foreground">{periodPhrase(period, historyStart)}</span>
            </span>
          </p>
        </div>
        <Select value={period} onValueChange={(v) => onPeriod(v as Period)}>
          <SelectTrigger size="sm" className="w-32" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Your net worth line starts once there&apos;s a day of history.</p>
        ) : (
          // Enter or Space picks the day the keyboard has moved the tooltip to.
          <div className="net-worth-chart" role="group" aria-label="Net worth by day" onKeyDown={pickActive}>
          <ResponsiveContainer {...CHART_RESIZE} width="100%" height={220}>
            <AreaChart
              data={data}
              margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
              style={{ cursor: "pointer" }}
              desc="Arrow keys move from day to day. Enter shows what that day's net worth was made of."
              onClick={(state) => {
                const point = data[Number(state?.activeTooltipIndex)];
                if (point) setPicked(point.date);
              }}
            >
              <defs>
                <linearGradient id="accountsNetWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--champagne)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--champagne)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              {/* Time, not a label per point: a day's place is its date, so the pointer finds that day. */}
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                ticks={xTicks}
                tickFormatter={xLabel}
                interval="preserveStartEnd"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                ticks={yTicks}
                interval={0}
                allowDataOverflow
                tickFormatter={(v: number) => formatTickMoney(v, yStep)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                {...chartTooltipProps}
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                contentStyle={tooltipContentStyle}
                labelStyle={{ color: "var(--bone)" }}
                itemStyle={{ color: "var(--popover-foreground)" }}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as DayPoint | undefined;
                  if (!point) return "";
                  return point.t === lastT ? `Today, ${fullDay(point.date)}` : fullDay(point.date);
                }}
                formatter={(v) => [formatCurrency(Number(v), "USD"), "Net worth"]}
              />
              <Area
                type="linear"
                dataKey="value"
                stroke="var(--champagne)"
                strokeWidth={1.75}
                strokeLinejoin="round"
                fill="url(#accountsNetWorthFill)"
                activeDot={{ r: 4, fill: "var(--champagne)", stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {pickedT !== null && pickedIndex !== null && (
                <>
                  <ReferenceLine x={pickedT} stroke="var(--champagne)" strokeOpacity={0.55} />
                  <ReferenceDot
                    x={pickedT}
                    y={series[pickedIndex]}
                    r={4.5}
                    fill="var(--champagne)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                </>
              )}
              <ActiveDay onChange={onActive} />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        )}
        {picked !== null && pickedIndex !== null && (
          <DayBreakdown
            rows={rows}
            date={picked}
            index={pickedIndex}
            order={groupOrder}
            firstDay={historyStart}
            today={today}
            onDate={setPicked}
            onClose={() => setPicked(null)}
          />
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Worked out from today&apos;s balances and the transactions since. Cash, property and metals count at today&apos;s value.
          {picked === null && data.length >= 2 && " Click a day to see what it was made of."}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * A picked day's net worth, taken apart: each group and account as it stood
 * at the end of that day, beside today, and how each has moved since.
 */
function DayBreakdown({
  rows,
  date,
  index,
  order,
  firstDay,
  today,
  onDate,
  onClose,
}: {
  rows: BoardRow[];
  date: string;
  index: number;
  order: GroupKey[];
  firstDay: string;
  today: string;
  onDate: (iso: string) => void;
  onClose: () => void;
}) {
  const { groups, netWorthThen, netWorthNow } = useMemo(() => breakdownOn(rows, index, order), [rows, index, order]);
  const headingId = useId();
  const cell = "py-1.5 pl-3 text-right align-baseline whitespace-nowrap";

  return (
    <section aria-labelledby={headingId} className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <h3 id={headingId} className="text-sm font-medium text-bone">
            Net worth on {fullDay(date)}
          </h3>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money amount={netWorthThen} currency="USD" tone="neutral" className="text-xl font-semibold" />
            <span className="inline-flex items-baseline gap-1.5">
              <Change amount={netWorthNow - netWorthThen} base={netWorthThen} className="text-sm" />
              <span className="text-xs text-muted-foreground">since then</span>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Day"
            value={date}
            min={firstDay}
            max={today}
            onChange={(e) => {
              const v = e.target.value;
              if (v >= firstDay && v <= today) onDate(v);
            }}
            className="h-7 w-[8.75rem] px-2 text-xs"
          />
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <X aria-hidden />
            Back to today
          </Button>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">
          Each account on {fullDay(date)}, today, and the change since
        </caption>
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th scope="col" className="pb-1.5 text-left font-normal">
              Account
            </th>
            <th scope="col" className="pb-1.5 pl-3 text-right font-normal">
              {shortDay(date)}
            </th>
            <th scope="col" className="hidden pb-1.5 pl-3 text-right font-normal sm:table-cell">
              Today
            </th>
            <th scope="col" className="pb-1.5 pl-3 text-right font-normal">
              Since then
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key} className="border-t border-border">
            <tr>
              <th scope="rowgroup" className="pt-3 pb-1 text-left font-medium">
                {g.label}
                {g.liability && <span className="font-normal text-muted-foreground"> owed</span>}
              </th>
              <td className={cn(cell, "pt-3 pb-1")}>
                <Money amount={g.then} currency="USD" tone="neutral" className="text-sm font-medium" />
              </td>
              <td className={cn(cell, "hidden pt-3 pb-1 sm:table-cell")}>
                <Money amount={g.now} currency="USD" tone="neutral" className="text-sm text-muted-foreground" />
              </td>
              <td className={cn(cell, "pt-3 pb-1")}>
                {/* Nothing with a history in it, nothing known about how it moved. */}
                {g.rows.some((r) => r.tracked) && <Change amount={g.now - g.then} liability={g.liability} />}
              </td>
            </tr>
            {g.rows.map(({ row, then, now, tracked }) => (
              <tr key={row.id} className="text-muted-foreground">
                <th scope="row" className="py-1.5 pl-3 text-left align-baseline font-normal">
                  <span className="text-foreground">{row.name}</span>
                  {row.mask && <span className="ml-1.5 hidden font-mono text-xs sm:inline">••{row.mask}</span>}
                  {!tracked && <span className="block text-[11px]">Counted at today&apos;s value</span>}
                </th>
                <td className={cell}>
                  <Money amount={then} currency="USD" tone="neutral" className="text-xs" />
                </td>
                <td className={cn(cell, "hidden sm:table-cell")}>
                  <Money amount={now} currency="USD" tone="neutral" className="text-xs text-muted-foreground" />
                </td>
                <td className={cell}>{tracked && <Change amount={now - then} liability={row.liability} />}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr className="border-t border-border">
            <th scope="row" className="pt-3 text-left font-medium">
              Net worth
            </th>
            <td className={cn(cell, "pt-3")}>
              <Money amount={netWorthThen} currency="USD" tone="neutral" className="text-sm font-semibold" />
            </td>
            <td className={cn(cell, "hidden pt-3 sm:table-cell")}>
              <Money amount={netWorthNow} currency="USD" tone="neutral" className="text-sm text-muted-foreground" />
            </td>
            <td className={cn(cell, "pt-3")}>
              <Change amount={netWorthNow - netWorthThen} />
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// ---- Groups ----------------------------------------------------------------

function AccountRow({ row, days, actions }: { row: BoardRow; days: number; actions: React.ReactNode }) {
  const change = row.series ? changeOver(row.series, days) : 0;
  return (
    // Fixed columns, so every row's buttons, trend line and balance line up
    // down the page and with the group's total, whatever each row has.
    <li className="group/row grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-border px-3 py-3 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_4.5rem_5rem_8.5rem] sm:gap-3 sm:px-4">
      <InstitutionAvatar institution={row.institution} icon={row.icon ?? undefined} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
          {row.transactionsHref ? (
            <Link href={row.transactionsHref} className="truncate transition-colors hover:text-champagne" title={`See ${row.name}'s transactions`}>
              {row.name}
            </Link>
          ) : (
            <span className="truncate">{row.name}</span>
          )}
          {row.mask && <span className="hidden shrink-0 font-mono text-xs font-normal text-muted-foreground sm:inline">••{row.mask}</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
      </div>
      <div className="flex items-center justify-end [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100">
        {actions}
      </div>
      <div className="hidden justify-center sm:flex">
        {row.series && (
          <Sparkline
            values={row.series.slice(row.series.length - 1 - days)}
            className={Math.abs(change) < 0.005 ? "text-muted-foreground/50" : "text-muted-foreground"}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
        <Money amount={row.balance} currency="USD" tone="neutral" className="text-sm font-medium" />
        <span className="truncate text-[11px] text-muted-foreground">
          <Updated updated={row.updated} />
        </span>
      </div>
    </li>
  );
}

function GroupCard({
  label,
  liability,
  rows,
  days,
  phrase,
  actions,
}: {
  label: string;
  liability: boolean;
  rows: BoardRow[];
  days: number;
  phrase: string;
  actions: Record<string, React.ReactNode>;
}) {
  const [open, setOpen] = useState(true);
  const total = rows.reduce((s, r) => s + r.balance, 0);
  const change = rows.reduce((s, r) => s + (r.series ? changeOver(r.series, days) : 0), 0);
  const start = total - change;
  const tracked = rows.some((r) => r.series);
  const id = `group-${label.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2 px-4 py-3">
        <DragHandle />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          className="-ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-bone"
        >
          <ChevronRight className={cn("size-4 transition-transform duration-200", open && "rotate-90")} />
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <CardTitle>{label}</CardTitle>
          {tracked && (
            <span className="inline-flex items-baseline gap-1.5">
              {/* A card balance's swing as a percent says little, so owed amounts show dollars only. */}
              <Change amount={change} base={liability ? undefined : start} liability={liability} />
              <span className="hidden text-xs text-muted-foreground sm:inline">{phrase}</span>
            </span>
          )}
        </div>
        <Money amount={total} currency="USD" tone="neutral" className="shrink-0 text-sm font-semibold" />
      </CardHeader>
      {open && (
        <ul id={id} className="border-t border-border">
          {rows.map((row) => (
            <AccountRow key={row.id} row={row} days={days} actions={actions[row.id]} />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- Summary ---------------------------------------------------------------

const KIND_COLOR: Record<SummaryKind, string> = {
  Cash: "var(--cat-transport)",
  Investments: "var(--cat-entertainment)",
  Property: "var(--cat-home)",
  Vehicles: "var(--cat-shopping)",
  Other: "var(--cat-other)",
  "Credit cards": "var(--cat-food)",
  Loans: "var(--cat-medical)",
};

function SummarySection({ title, total, parts, percent }: { title: string; total: number; parts: { kind: SummaryKind; amount: number }[]; percent: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <Money amount={total} currency="USD" tone="neutral" className="text-sm text-muted-foreground" />
      </div>
      {total > 0 ? (
        <>
          <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            {parts.map((p) => (
              <span key={p.kind} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.amount / total) * 100}%`, backgroundColor: KIND_COLOR[p.kind] }} />
            ))}
          </div>
          <ul className="flex flex-col gap-2">
            {parts.map((p) => (
              <li key={p.kind} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: KIND_COLOR[p.kind] }} aria-hidden />
                  {p.kind}
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {percent ? `${((p.amount / total) * 100).toFixed(1)}%` : formatCurrency(p.amount, "USD")}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">None</p>
      )}
    </div>
  );
}

export function AccountsSummary({ rows }: { rows: BoardRow[] }) {
  const [percent, setPercent] = useState(false);
  const s = summarize(rows);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Summary</CardTitle>
        <div role="radiogroup" aria-label="Show" className="flex rounded-md border border-border p-0.5 text-xs">
          {[
            { value: false, label: "Totals" },
            { value: true, label: "Percent" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={percent === o.value}
              onClick={() => setPercent(o.value)}
              className={cn(
                "rounded-[5px] px-2.5 py-1 transition-colors",
                percent === o.value ? "bg-bone/12 text-bone ring-1 ring-bone/10 ring-inset hover:bg-bone/16" : "text-muted-foreground hover:bg-bone/6 hover:text-bone"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SummarySection title="Assets" total={s.totalAssets} parts={s.assets} percent={percent} />
        <SummarySection title="Liabilities" total={s.totalLiabilities} parts={s.liabilities} percent={percent} />
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Net worth</p>
          <Money amount={s.netWorth} currency="USD" tone="neutral" className="text-sm font-semibold" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---- The page's main column ------------------------------------------------

/**
 * Net worth over a chosen period, then every account grouped by what it is,
 * each group with its total and its change over the same period. Groups
 * fold shut and can be dragged into any order, which is kept.
 */
export function AccountsBoard({
  rows,
  actions,
  historyStart,
  savedOrder,
}: {
  rows: BoardRow[];
  // Each row's buttons, by row id.
  actions: Record<string, React.ReactNode>;
  historyStart: string;
  savedOrder: string[];
}) {
  const [period, setPeriod] = useState<Period>("1M");
  const series = useMemo(() => netWorthSeries(rows), [rows]);
  const days = periodDays(period, series.length);
  const phrase = periodPhrase(period, historyStart);

  const byGroup = new Map<GroupKey, BoardRow[]>();
  for (const r of rows) byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r]);

  const cards: SortableCard[] = applyCardOrder(
    GROUPS.filter((g) => byGroup.has(g.key)).map((g) => ({
      id: `group:${g.key}`,
      label: g.label,
      node: (
        <GroupCard
          label={g.label}
          liability={g.liability}
          rows={[...byGroup.get(g.key)!].sort((a, b) => b.balance - a.balance)}
          days={days}
          phrase={phrase}
          actions={actions}
        />
      ),
    })),
    (c) => c.id,
    savedOrder
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <NetWorthPanel
        rows={rows}
        series={series}
        historyStart={historyStart}
        groupOrder={cards.map((c) => c.id.slice("group:".length) as GroupKey)}
        period={period}
        onPeriod={setPeriod}
      />
      {cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No accounts yet. Add one to get started.</p>
      ) : (
        <SortableCardList page="accounts" cards={cards} />
      )}
    </div>
  );
}
