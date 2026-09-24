"use client";

import { useState, type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { CategoryTotal, MonthTotal } from "@/lib/spending-aggregation";

// Category colors are --viz-1..13 in globals.css: the same muted colors as
// each category's transaction icons. Slot assignment is fixed per category
// (src/lib/plaid-categories.ts), never reassigned by rank, so a category is
// always the same color. They encode category identity, not a
// money-in/money-out signal.
const vizColor = (slot: number) => `var(--viz-${slot})`;

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const tooltipLabelStyle: CSSProperties = { color: "var(--bone)" };
const tooltipItemStyle: CSSProperties = { color: "var(--popover-foreground)" };
const legendStyle: CSSProperties = { fontSize: 12, color: "var(--ash-grey)" };

export function SpendingCharts({
  categoryTotals,
  monthlyTotals,
  currency,
  monthLabel,
}: {
  categoryTotals: CategoryTotal[];
  monthlyTotals: MonthTotal[];
  currency: string | null;
  monthLabel: string;
}) {
  const monthTotal = categoryTotals.reduce((sum, c) => sum + c.amount, 0);
  // The slice under the pointer (or tapped, on a phone). It is read out in the
  // middle of the donut, where the total normally is, so there is no floating
  // tooltip to land on top of anything.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? (categoryTotals[activeIndex] ?? null) : null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Spending by category — {monthLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryTotals.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No spending recorded yet this month.
            </p>
          ) : (
            <div className="relative">
              <ResponsiveContainer {...CHART_RESIZE} width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryTotals}
                    dataKey="amount"
                    nameKey="label"
                    innerRadius={70}
                    outerRadius={110}
                    strokeWidth={2}
                    stroke="var(--card)"
                    onMouseEnter={(_: unknown, index: number) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={(_: unknown, index: number) => setActiveIndex(index)}
                  >
                    {categoryTotals.map((c, i) => (
                      <Cell
                        key={c.category}
                        fill={vizColor(c.colorSlot)}
                        fillOpacity={activeIndex === null || activeIndex === i ? 1 : 0.4}
                      />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={48}
                    wrapperStyle={legendStyle}
                    formatter={(value) => <span style={{ color: "var(--ash-grey)" }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center text-center"
                style={{ height: 300 - 48 }}
              >
                {active ? (
                  <>
                    <span className="max-w-[9rem] truncate text-xs text-muted-foreground">{active.label}</span>
                    <Money amount={active.amount} currency={currency} tone="negative" className="text-xl font-semibold" />
                    <span className="text-xs text-muted-foreground">
                      {monthTotal > 0 ? `${Math.round((active.amount / monthTotal) * 100)}% of the month` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">Total</span>
                    <Money amount={monthTotal} currency={currency} tone="negative" className="text-xl font-semibold" />
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spending by month</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyTotals.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No spending history yet.
            </p>
          ) : (
            <ResponsiveContainer {...CHART_RESIZE} width="100%" height={300}>
              <BarChart data={monthlyTotals}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
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
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                {/* Always a spend total (never inflow), so this uses oxblood
                    rather than the categorical --viz palette above. */}
                <Bar dataKey="amount" fill="var(--oxblood)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
