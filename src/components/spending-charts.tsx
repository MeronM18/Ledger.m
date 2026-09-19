"use client";

import type { CSSProperties } from "react";
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
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { CategoryTotal, MonthTotal } from "@/lib/spending-aggregation";

// Categorical colors are the fixed, validated 8-slot palette in globals.css
// (--viz-1..8) — see the dataviz skill's references/palette.md. Slot
// assignment is fixed per category (src/lib/plaid-categories.ts), never
// reassigned by rank, so a category is always the same color. Independent
// of the site's champagne/sage/brick chrome theme — this palette encodes
// category identity, not a money-in/money-out signal.
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
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryTotals}
                    dataKey="amount"
                    nameKey="label"
                    innerRadius={70}
                    outerRadius={110}
                    strokeWidth={2}
                    stroke="var(--card)"
                  >
                    {categoryTotals.map((c) => (
                      <Cell key={c.category} fill={vizColor(c.colorSlot)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value), currency)}
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Legend verticalAlign="bottom" height={48} wrapperStyle={legendStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center text-center"
                style={{ height: 300 - 48 }}
              >
                <span className="text-xs text-muted-foreground">Total</span>
                <Money amount={monthTotal} currency={currency} tone="negative" className="text-xl font-semibold" />
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
            <ResponsiveContainer width="100%" height={300}>
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
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                {/* Always a spend total (never inflow), so this uses brick
                    rather than the categorical --viz palette above. */}
                <Bar dataKey="amount" fill="var(--muted-brick)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
