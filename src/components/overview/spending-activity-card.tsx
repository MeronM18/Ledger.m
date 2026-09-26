"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CARD_GRIP } from "@/components/overview/stat-tile";
import { Segmented } from "@/components/segmented";
import { DragHandle } from "@/components/sortable-card-list";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { formatCurrency } from "@/lib/format";
import { usualOf, type ActivityBar, type SpendingActivity } from "@/lib/overview";
import { cn } from "@/lib/utils";

const usd = (n: number) => formatCurrency(n, "USD");
const whole = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));

const VIEWS = {
  day: { label: "Day", now: "Today", unit: "day", count: "7 days" },
  week: { label: "Week", now: "This week", unit: "week", count: "8 weeks" },
  month: { label: "Month", now: "This month", unit: "month", count: "6 months" },
} as const;
type View = keyof typeof VIEWS;

/**
 * What's been spent today, this week or this month, with the days, weeks or
 * months before it as bars and a line at the usual (their average), so one
 * glance says whether this one is running high. Opens Spending.
 */
export function SpendingActivityCard({ activity }: { activity: SpendingActivity }) {
  const [view, setView] = useState<View>("month");
  const bars = activity[view];
  const current = bars.find((b) => b.current)!;
  const usual = usualOf(bars);
  const diff = usual !== null ? current.amount - usual : null;
  const v = VIEWS[view];

  return (
    <section aria-label="Spending" className="relative flex h-full flex-col gap-4 rounded-xl border border-border bg-card px-5 pt-4 pb-5">
      <DragHandle className={CARD_GRIP} />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm text-muted-foreground">Spending</h2>
        <Link href="/reports/spending" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne">
          Reports <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
      <Segmented label="Spending by" value={view} onChange={setView} options={(Object.keys(VIEWS) as View[]).map((k) => ({ value: k, label: VIEWS[k].label }))} />
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-[1.75rem] leading-none font-medium tracking-[-0.01em] text-bone">{usd(current.amount)}</span>
          <span className="text-sm text-muted-foreground">{v.now.toLowerCase()}</span>
        </p>
        {diff !== null && usual !== null && (
          <p className="text-xs text-muted-foreground">
            {Math.abs(diff) < Math.max(1, usual * 0.03) ? (
              <>About your usual {whole(usual)} a {v.unit}</>
            ) : (
              <>
                <span className={diff > 0 ? "text-champagne" : "text-moss"}>
                  {whole(Math.abs(diff))} {diff > 0 ? "more" : "less"}
                </span>{" "}
                than your usual {whole(usual)} a {v.unit}
                {view !== "day" && ", so far"}
              </>
            )}
          </p>
        )}
      </div>
      <div className="h-36" role="img" aria-label={`Spending, the last ${v.count}: ${bars.map((b) => `${b.label} ${whole(b.amount)}`).join(", ")}.`}>
        <ResponsiveContainer {...CHART_RESIZE} width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 14, right: 0, bottom: 0, left: 0 }} barCategoryGap="30%">
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={0} />
            <YAxis hide domain={[0, (max: number) => Math.max(max, usual ?? 0) * 1.1]} />
            {usual !== null && usual > 0 && (
              <ReferenceLine
                y={usual}
                stroke="var(--bone)"
                strokeOpacity={0.35}
                strokeDasharray="3 3"
                label={{ value: "Usual", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 10, dy: -12 }}
              />
            )}
            <Tooltip
              {...chartTooltipProps}
              cursor={{ fill: "var(--bone)", fillOpacity: 0.04 }}
              content={({ active, payload }) => {
                const b = payload?.[0]?.payload as ActivityBar | undefined;
                if (!active || !b) return null;
                return (
                  <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground">
                    <span className="text-muted-foreground">{b.current ? v.now : view === "week" ? `Week of ${b.label}` : b.label}</span>{" "}
                    <span className="font-mono text-bone tabular-nums">{usd(b.amount)}</span>
                  </div>
                );
              }}
            />
            <Bar dataKey="amount" radius={[4, 4, 4, 4]} maxBarSize={18} minPointSize={2} isAnimationActive={false}>
              {bars.map((b) => (
                <Cell key={b.key} fill={b.current ? "var(--champagne)" : "color-mix(in oklab, var(--bone) 22%, transparent)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className={cn("-mt-2 text-[11px] text-muted-foreground")}>The last {v.count}, net of refunds.</p>
    </section>
  );
}
