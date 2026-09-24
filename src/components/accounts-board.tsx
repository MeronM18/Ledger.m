"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { Money } from "@/components/money";
import { DragHandle, SortableCardList, type SortableCard } from "@/components/sortable-card-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeOver, PERIODS, thin, type Period } from "@/lib/account-history";
import { GROUPS, netWorthSeries, summarize, type BoardRow, type GroupKey, type SummaryKind } from "@/lib/accounts-board";
import { applyCardOrder } from "@/lib/card-order";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { formatCompactCurrency, formatCurrency, timeAgo } from "@/lib/format";
import { sparklinePath } from "@/lib/net-worth-trend";
import { cn } from "@/lib/utils";

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

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

function NetWorthPanel({
  series,
  historyStart,
  period,
  onPeriod,
}: {
  series: number[];
  historyStart: string;
  period: Period;
  onPeriod: (p: Period) => void;
}) {
  const days = periodDays(period, series.length);
  const span = series.slice(series.length - 1 - days);
  const firstDay = addDaysIso(historyStart, series.length - 1 - days);
  const now = series[series.length - 1] ?? 0;
  const change = now - (span[0] ?? now);
  const data = useMemo(() => {
    // One point a day up to a few months; beyond that, spaced out so the line stays smooth.
    const step = Math.max(1, Math.ceil(span.length / 180));
    const points = span.flatMap((v, i) => (i % step === 0 || i === span.length - 1 ? [{ date: addDaysIso(firstDay, i), value: v }] : []));
    return points.map((p) => ({ ...p, label: dayLabel(p.date) }));
  }, [span, firstDay]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Net worth</p>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money amount={now} currency="USD" tone="neutral" className="text-3xl font-semibold" />
            <span className="inline-flex items-baseline gap-1.5">
              <Change amount={change} base={span[0]} className="text-sm" />
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
          <ResponsiveContainer {...CHART_RESIZE} width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="accountsNetWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--champagne)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--champagne)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(v: number) => formatCompactCurrency(v, "USD")}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={52}
                domain={["auto", "auto"]}
              />
              <Tooltip
                {...chartTooltipProps}
                contentStyle={tooltipContentStyle}
                labelStyle={{ color: "var(--bone)" }}
                itemStyle={{ color: "var(--popover-foreground)" }}
                labelFormatter={(_, payload) => (payload?.[0] ? fullDay((payload[0].payload as { date: string }).date) : "")}
                formatter={(v) => [formatCurrency(Number(v), "USD"), "Net worth"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--champagne)"
                strokeWidth={1.75}
                fill="url(#accountsNetWorthFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Worked out from today&apos;s balances and the transactions since. Cash, property and metals count at today&apos;s value.
        </p>
      </CardContent>
    </Card>
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
                percent === o.value ? "bg-bone/10 text-bone" : "text-muted-foreground hover:text-foreground"
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
      <NetWorthPanel series={series} historyStart={historyStart} period={period} onPeriod={setPeriod} />
      {cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No accounts yet. Add one to get started.</p>
      ) : (
        <SortableCardList page="accounts" cards={cards} />
      )}
    </div>
  );
}
