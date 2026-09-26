"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CARD_GRIP } from "@/components/overview/stat-tile";
import { Segmented } from "@/components/segmented";
import { DragHandle } from "@/components/sortable-card-list";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { formatTickMoney, valueTicks } from "@/lib/day-chart";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [
  { value: "1M", label: "1M", days: 30, name: "the last month" },
  { value: "3M", label: "3M", days: 91, name: "the last 3 months" },
  { value: "1Y", label: "1Y", days: 365, name: "the last year" },
  { value: "ALL", label: "All", days: null, name: "all time" },
] as const;
type Range = (typeof RANGES)[number]["value"];

const usd = (n: number) => formatCurrency(n, "USD");
const DAY = 86_400_000;
const isoPlus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const dateLabel = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" });

type Point = { date: string; value: number };

/**
 * Net worth, the Overview's headline: the figure, how it moved over the
 * range picked, and the line of it day by day, the same line the Accounts
 * page draws. Opens Accounts.
 */
export function NetWorthCard({ start, series, error }: { start: string; series: number[]; error: boolean }) {
  const [range, setRange] = useState<Range>("1M");
  const all = useMemo<Point[]>(() => series.map((value, i) => ({ date: isoPlus(start, i), value })), [start, series]);
  const days = RANGES.find((r) => r.value === range)!.days;
  const points = days === null ? all : all.slice(-(days + 1));
  const now = all.at(-1)?.value ?? 0;
  const from = points[0]?.value ?? now;
  const change = Math.round((now - from) * 100) / 100;
  const pct = from !== 0 ? change / Math.abs(from) : null;
  const up = change >= 0;

  const ticks = useMemo(() => {
    const values = points.map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    // Room above and below the line, so it doesn't sit on the axis.
    const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.01, 1);
    // Not below zero when it never went below zero.
    return valueTicks(lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad, 4);
  }, [points]);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  // A handful of dates along the bottom, evenly spaced.
  const xTicks = useMemo(() => {
    const n = Math.min(6, points.length);
    return n < 2 ? points.map((p) => p.date) : Array.from({ length: n }, (_, i) => points[Math.round((i * (points.length - 1)) / (n - 1))].date);
  }, [points]);
  const [dollars, cents] = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(now)).split(".");
  const rangeName = RANGES.find((r) => r.value === range)!.name;

  return (
    <section aria-label="Net worth" className="relative flex h-full flex-col gap-4 rounded-xl border border-border bg-card px-5 pt-4 pb-4">
      <DragHandle className={CARD_GRIP} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm text-muted-foreground">Net worth</h2>
          {error ? (
            <span className="text-sm text-muted-foreground">Couldn&apos;t load your balances.</span>
          ) : (
            <>
              <span className="font-serif text-[2.75rem] leading-none font-medium tracking-[-0.01em] text-bone">
                {now < 0 ? "−" : ""}
                {dollars}
                <span className="text-[0.5em] text-bone/60">.{cents}</span>
              </span>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className={cn("font-mono tabular-nums", up ? "text-moss" : "text-oxblood-text")}>
                  {up ? "+" : "−"}
                  {usd(Math.abs(change))}
                </span>
                {pct !== null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ring-1 ring-inset",
                      up ? "bg-moss/12 text-moss ring-moss/25" : "bg-oxblood/15 text-oxblood-text ring-oxblood/30"
                    )}
                  >
                    {up ? <ArrowUp className="size-3" strokeWidth={2.5} aria-hidden /> : <ArrowDown className="size-3" strokeWidth={2.5} aria-hidden />}
                    {Math.abs(pct * 100).toFixed(Math.abs(pct) < 0.1 ? 1 : 0)}%
                  </span>
                )}
                <span className="text-muted-foreground">
                  over {rangeName}
                  {points.length < (days ?? 0) ? ` (since ${dateLabel(points[0]?.date ?? start)})` : ""}
                </span>
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Segmented label="Range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label, title: r.name }))} />
          <Link href="/accounts" className="hidden items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne sm:inline-flex">
            Accounts <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      </div>

      {!error && points.length > 1 && (
        <div className="h-60 min-h-60 flex-1 sm:h-64" role="img" aria-label={`Net worth over ${rangeName}: from ${usd(from)} to ${usd(now)}.`}>
          <ResponsiveContainer {...CHART_RESIZE} width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 22, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--champagne)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--champagne)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis
                dataKey="date"
                ticks={xTicks}
                tickFormatter={(d: string) => dateLabel(d)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                domain={[ticks[0], ticks[ticks.length - 1]]}
                ticks={ticks}
                interval={0}
                tickFormatter={(v: number) => formatTickMoney(v, step)}
                width={56}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                {...chartTooltipProps}
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as Point | undefined;
                  if (!active || !p) return null;
                  const diff = p.value - from;
                  return (
                    <div className="flex min-w-44 flex-col gap-1 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground">
                      <p className="text-muted-foreground">{dateLabel(p.date, true)}</p>
                      <p className="font-mono text-sm text-bone tabular-nums">{usd(p.value)}</p>
                      <p className={cn("font-mono tabular-nums", diff >= 0 ? "text-moss" : "text-oxblood-text")}>
                        {diff >= 0 ? "+" : "−"}
                        {usd(Math.abs(diff))} since {dateLabel(points[0].date)}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--champagne)"
                strokeWidth={2}
                fill="url(#netWorthFill)"
                activeDot={{ r: 4, fill: "var(--champagne)", stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
