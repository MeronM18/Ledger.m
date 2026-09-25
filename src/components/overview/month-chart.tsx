"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CARD_GRIP } from "@/components/overview/stat-tile";
import { Segmented } from "@/components/segmented";
import { DragHandle } from "@/components/sortable-card-list";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { formatTickMoney, valueTicks } from "@/lib/day-chart";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const tooltipStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  padding: "8px 10px",
  minWidth: 190,
};

const usd = (n: number) => formatCurrency(n, "USD");
const whole = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));
const HEADLINE = "font-serif text-[2.5rem] leading-none font-medium tracking-[-0.01em]";

type DayPoint = { day: number; spent?: number; last?: number; pace?: number };

function Row({ label, value, swatch }: { label: string; value: string; swatch: React.ReactNode }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {swatch}
        {label}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </p>
  );
}

const SWATCH = {
  spent: <span className="h-0.5 w-3 rounded-full bg-champagne" />,
  income: <span className="h-0.5 w-3 rounded-full bg-moss" />,
  last: <span className="w-3 border-t border-dashed border-ash-grey/70" />,
  pace: <span className="h-0.5 w-3 rounded-full bg-moss" />,
};

/**
 * This month's spending, the headline of the Overview: how it stands against
 * the monthly budget, then day by day as a running total against an even
 * pace to the budget and against last month, or month by month.
 */
export function MonthChart({
  monthName,
  previousMonthName,
  monthKey,
  today,
  daily,
  lastMonth,
  budget,
  months,
}: {
  monthName: string; // "September"
  previousMonthName: string;
  monthKey: string; // "2026-09"
  // The day of the month it is.
  today: number;
  // This month's spending, running total, every day (index 0 = the 1st).
  daily: number[];
  // Last month's running total, every day.
  lastMonth: number[];
  // The monthly budget, or null when none is set.
  budget: number | null;
  // Money in and spending, each of the last few months.
  months: { month: string; spending: number; income: number }[];
}) {
  const [view, setView] = useState<"days" | "months">("days");
  const days = daily.length;
  const daysLeft = days - today;
  const spent = daily[Math.min(today, days) - 1] ?? 0;
  const ahead = budget !== null ? spent - (budget * today) / days : null;

  const dayData = useMemo<DayPoint[]>(
    () =>
      Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        spent: i < today ? daily[i] : undefined,
        last: i < lastMonth.length ? lastMonth[i] : undefined,
        pace: budget !== null ? Math.round(((budget * (i + 1)) / days) * 100) / 100 : undefined,
      })),
    [days, today, daily, lastMonth, budget]
  );
  const dayTicks = useMemo(() => valueTicks(0, Math.max(budget ?? 0, ...daily.slice(0, today), ...lastMonth), 4), [budget, daily, lastMonth, today]);
  const monthTicks = useMemo(() => valueTicks(0, Math.max(budget ?? 0, ...months.flatMap((m) => [m.spending, m.income])), 4), [budget, months]);
  const ticks = view === "days" ? dayTicks : monthTicks;
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const short = monthName.slice(0, 3);
  const axis = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;

  return (
    <section aria-label={`Spending in ${monthName}`} className="relative flex h-full flex-col gap-5 rounded-xl border border-border bg-card px-5 pt-4 pb-5">
      <DragHandle className={CARD_GRIP} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm text-muted-foreground">Spending in {monthName}</h2>
        <Segmented
          label="Show spending"
          value={view}
          onChange={setView}
          options={[
            { value: "days", label: "Day by day" },
            { value: "months", label: "Month by month" },
          ]}
        />
      </div>

      {/* The headline is how the month is going against the budget; what's been spent is its note. */}
      <div className="flex flex-col gap-1">
        {budget === null || ahead === null ? (
          <>
            <span className={cn(HEADLINE, "text-bone")}>{usd(spent)}</span>
            <Link href="/budgets" className="inline-flex items-center gap-1 self-start text-sm text-champagne hover:underline">
              Set a monthly budget to see your pace <ArrowRight className="size-3" aria-hidden />
            </Link>
          </>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {spent > budget ? (
                <>
                  <span className={cn(HEADLINE, "text-oxblood-text")}>{whole(spent - budget)}</span>
                  <span className="text-base text-oxblood-text">over your budget</span>
                </>
              ) : Math.abs(ahead) < budget * 0.02 ? (
                <span className={cn(HEADLINE, "text-bone")}>On pace</span>
              ) : (
                <>
                  <span className={cn(HEADLINE, "text-bone")}>{whole(Math.abs(ahead))}</span>
                  <span className={cn("text-base", ahead > 0 ? "text-champagne" : "text-moss")}>{ahead > 0 ? "ahead of an even pace" : "under an even pace"}</span>
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-bone tabular-nums">{usd(spent)}</span>
              <span className="sm:hidden">
                {" "}
                of {whole(budget)} · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
              <span className="hidden sm:inline">
                {" "}
                spent of your {whole(budget)} budget, {daysLeft} {daysLeft === 1 ? "day" : "days"} to go
              </span>
            </p>
          </>
        )}
      </div>

      <div
        className="h-72 sm:h-80"
        role="group"
        aria-label={
          view === "days"
            ? `${monthName} spending day by day: ${usd(spent)} by the ${today}${budget !== null ? `, against a ${whole(budget)} budget` : ""}.`
            : `Money in and spending by month, the last ${months.length} months.`
        }
      >
        <ResponsiveContainer {...CHART_RESIZE} width="100%" height="100%">
          {view === "days" ? (
            <ComposedChart data={dayData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="overviewSpent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--champagne)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--champagne)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis dataKey="day" type="number" domain={[1, days]} ticks={[1, 8, 15, 22, days]} tickFormatter={(d: number) => `${short} ${d}`} {...axis} />
              <YAxis domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} interval={0} tickFormatter={(v: number) => formatTickMoney(v, step)} width={52} {...axis} />
              {budget !== null && (
                <ReferenceLine
                  y={budget}
                  stroke="var(--bone)"
                  strokeOpacity={0.3}
                  strokeDasharray="1 3"
                  label={{ value: `Budget ${whole(budget)}`, position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11, dy: -12 }}
                />
              )}
              <Tooltip
                {...chartTooltipProps}
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as DayPoint | undefined;
                  if (!active || !p) return null;
                  return (
                    <div style={tooltipStyle} className="flex flex-col gap-1">
                      <p className="text-bone">
                        {monthName} {p.day}
                        {p.day === today ? ", today" : ""}
                      </p>
                      {p.spent !== undefined && <Row label="Spent so far" value={usd(p.spent)} swatch={SWATCH.spent} />}
                      {p.pace !== undefined && <Row label="Even pace" value={usd(p.pace)} swatch={SWATCH.pace} />}
                      {p.last !== undefined && <Row label={`${previousMonthName}, same day`} value={usd(p.last)} swatch={SWATCH.last} />}
                    </div>
                  );
                }}
              />
              {budget !== null && (
                <Line type="linear" dataKey="pace" stroke="var(--moss)" strokeOpacity={0.7} strokeWidth={1.25} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
              )}
              {/* Running totals move in steps: each day's purchases land on that day. */}
              {/* Last month dashed and faint, so it reads as a second series rather than a shadow of this one. */}
              <Line type="stepAfter" dataKey="last" stroke="var(--ash-grey)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 3" dot={false} activeDot={false} isAnimationActive={false} />
              <Area
                type="stepAfter"
                dataKey="spent"
                stroke="var(--champagne)"
                strokeWidth={2}
                fill="url(#overviewSpent)"
                activeDot={{ r: 4, fill: "var(--champagne)", stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            </ComposedChart>
          ) : (
            <BarChart data={months} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%" barGap={3}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
              <YAxis domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} interval={0} tickFormatter={(v: number) => formatTickMoney(v, step)} width={52} {...axis} />
              {/* Named in the legend rather than on the line, where it would sit over the first bars. */}
              {budget !== null && <ReferenceLine y={budget} stroke="var(--bone)" strokeOpacity={0.35} strokeDasharray="1 3" />}
              <Tooltip
                {...chartTooltipProps}
                cursor={{ fill: "var(--bone)", fillOpacity: 0.04 }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as { month: string; spending: number; income: number } | undefined;
                  if (!active || !p) return null;
                  const kept = p.income - p.spending;
                  return (
                    <div style={tooltipStyle} className="flex flex-col gap-1">
                      <p className="text-bone">
                        {new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                        {p.month === monthKey ? ", so far" : ""}
                      </p>
                      <Row label="Money in" value={usd(p.income)} swatch={SWATCH.income} />
                      <Row label="Spent" value={usd(p.spending)} swatch={SWATCH.spent} />
                      <p className="flex items-center justify-between gap-4 border-t border-border pt-1">
                        <span className="text-muted-foreground">{kept >= 0 ? "Kept" : "Spent more than came in"}</span>
                        <span className="font-mono tabular-nums">{usd(Math.abs(kept))}</span>
                      </p>
                      {budget !== null && p.spending > budget && <p className="text-right text-oxblood-text">{whole(p.spending - budget)} over budget</p>}
                    </div>
                  );
                }}
              />
              {/* Money in beside what was spent, each month; the month so far at full strength. */}
              <Bar dataKey="income" radius={[5, 5, 5, 5]} maxBarSize={28} isAnimationActive={false}>
                {months.map((m) => (
                  <Cell key={m.month} fill={m.month === monthKey ? "var(--moss)" : "color-mix(in oklab, var(--moss) 55%, transparent)"} />
                ))}
              </Bar>
              <Bar dataKey="spending" radius={[5, 5, 5, 5]} maxBarSize={28} isAnimationActive={false}>
                {months.map((m) => (
                  <Cell key={m.month} fill={m.month === monthKey ? "var(--champagne)" : "color-mix(in oklab, var(--champagne) 55%, transparent)"} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {view === "days" ? (
          <>
            <span className="inline-flex items-center gap-1.5">{SWATCH.spent}This month</span>
            {budget !== null && <span className="inline-flex items-center gap-1.5">{SWATCH.pace}Even pace to your budget</span>}
            <span className="inline-flex items-center gap-1.5">
              {SWATCH.last}
              {previousMonthName}
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">{SWATCH.income}Money in</span>
            <span className="inline-flex items-center gap-1.5">{SWATCH.spent}Spent</span>
            {budget !== null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t border-dotted border-bone/60" />
                Budget {whole(budget)}
              </span>
            )}
          </>
        )}
      </p>
    </section>
  );
}
