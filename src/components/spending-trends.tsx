"use client";

import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { dailyAverage, type CategoryChange, type MonthRef, type Pace } from "@/lib/trends";
import { cn } from "@/lib/utils";
import { chartTooltipProps } from "@/lib/chart-style";

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const legendStyle: CSSProperties = { fontSize: 12, color: "var(--ash-grey)" };

function pctLabel(pct: number): string {
  return `${Math.abs(Math.round(pct * 100))}%`;
}

function PaceHeadline({
  pace,
  monthLabel,
  previousMonthLabel,
  typical,
  currency,
}: {
  pace: Pace;
  monthLabel: string;
  previousMonthLabel: string;
  typical: number | null;
  currency: string | null;
}) {
  if (!pace.hasPrevious) {
    return (
      <p className="text-sm text-muted-foreground">
        {formatCurrency(pace.current, currency)} spent in {monthLabel}. There&apos;s no earlier month to compare against yet.
      </p>
    );
  }

  const less = pace.delta < 0;
  const same = pace.delta === 0;
  const when = pace.isCurrentMonth ? `by day ${pace.throughDay}` : "overall";

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        <Money amount={pace.current} currency={currency} tone="neutral" className="text-2xl font-semibold" />
        <span className="ml-2 text-muted-foreground">
          {pace.isCurrentMonth ? `so far in ${monthLabel}` : `in ${monthLabel}`}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        {same ? (
          <>The same as {previousMonthLabel} {when}.</>
        ) : (
          <>
            <span className={cn("font-medium", less ? "text-moss" : "text-oxblood-text")}>
              {formatCurrency(Math.abs(pace.delta), currency)}
              {pace.deltaPct !== null ? ` (${pctLabel(pace.deltaPct)})` : ""} {less ? "less" : "more"}
            </span>{" "}
            than {previousMonthLabel} {when}.
          </>
        )}{" "}
        {pace.isCurrentMonth && <>{previousMonthLabel} ended at {formatCurrency(pace.previousTotal, currency)}.</>}
        {typical !== null && <> A typical month is {formatCurrency(typical, currency)}.</>}
      </p>
    </div>
  );
}

export function SpendingTrends({
  pace,
  monthRef,
  changes,
  typical,
  monthLabel,
  previousMonthLabel,
  currency,
  activeCategory,
  onSelectCategory,
}: {
  pace: Pace;
  monthRef: MonthRef;
  changes: CategoryChange[];
  typical: number | null;
  monthLabel: string;
  previousMonthLabel: string;
  currency: string | null;
  activeCategory: string;
  onSelectCategory: (category: string) => void;
}) {
  const daily = dailyAverage(pace, monthRef);
  const topChanges = changes.slice(0, 6);
  const maxAbs = Math.max(1, ...topChanges.map((c) => Math.abs(c.delta)));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Pace vs {previousMonthLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <PaceHeadline
            pace={pace}
            monthLabel={monthLabel}
            previousMonthLabel={previousMonthLabel}
            typical={typical}
            currency={currency}
          />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border p-3 sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Daily average</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">{formatCurrency(daily.current, currency)}</dd>
              <dd className="text-xs text-muted-foreground">{pace.isCurrentMonth ? "so far this month" : "for the month"}</dd>
            </div>
            {daily.previous !== null && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{previousMonthLabel}</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">{formatCurrency(daily.previous, currency)}</dd>
                <dd className={cn("text-xs", daily.deltaPct === null ? "text-muted-foreground" : daily.deltaPct <= 0 ? "text-moss" : "text-oxblood-text")}>
                  {daily.deltaPct === null ? "a day" : `${daily.deltaPct <= 0 ? "down" : "up"} ${Math.abs(Math.round(daily.deltaPct * 100))}% now`}
                </dd>
              </div>
            )}
            {daily.projectedMonthTotal !== null && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">On pace for</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">{formatCurrency(daily.projectedMonthTotal, currency)}</dd>
                <dd className="text-xs text-muted-foreground">by month end</dd>
              </div>
            )}
          </dl>
          {pace.hasPrevious && (
            <div className="min-h-[220px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pace.series}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
        {...chartTooltipProps}
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  labelFormatter={(day) => `Day ${day}`}
                  contentStyle={tooltipContentStyle}
                  labelStyle={{ color: "var(--bone)" }}
                  itemStyle={{ color: "var(--popover-foreground)" }}
                />
                <Legend verticalAlign="bottom" height={28} wrapperStyle={legendStyle} />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name={previousMonthLabel}
                  stroke="var(--ash-grey)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="current"
                  name={monthLabel}
                  stroke="var(--champagne)"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Biggest changes vs {previousMonthLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {topChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {pace.hasPrevious ? "Nothing changed between these months." : "There's no earlier month to compare against yet."}
            </p>
          ) : (
            <div className="flex flex-col">
              {topChanges.map((c) => {
                const up = c.delta > 0;
                const selected = activeCategory === c.category;
                return (
                  <button
                    key={c.category}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectCategory(selected ? "all" : c.category)}
                    className={cn(
                      "flex flex-col gap-1.5 border-t border-border py-3 text-left transition-colors first:border-t-0 first:pt-0 hover:bg-muted/40",
                      selected && "bg-muted/40"
                    )}
                  >
                    <span className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: `var(--viz-${c.colorSlot})` }}
                          aria-hidden
                        />
                        {c.label}
                      </span>
                      <span className={cn("flex items-center gap-1 font-mono tabular-nums", up ? "text-oxblood-text" : "text-moss")}>
                        {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
                        {formatCurrency(Math.abs(c.delta), currency)}
                        <span className="sr-only">{up ? " more" : " less"}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className={cn("block h-full rounded-full", up ? "bg-oxblood" : "bg-moss")}
                          style={{ width: `${(Math.abs(c.delta) / maxAbs) * 100}%` }}
                        />
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(c.previous, currency)} → {formatCurrency(c.current, currency)}
                      {c.deltaPct !== null ? ` (${up ? "+" : "-"}${pctLabel(c.deltaPct)})` : c.previous === 0 ? " (new this month)" : ""}
                    </span>
                  </button>
                );
              })}
              <p className="pt-3 text-xs text-muted-foreground">Select a category to see its transactions below.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
