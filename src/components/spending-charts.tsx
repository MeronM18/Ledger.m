"use client";

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
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { CategoryTotal, MonthTotal } from "@/lib/spending-aggregation";

// Categorical colors are the fixed, validated 8-slot palette in globals.css
// (--viz-1..8) — see the dataviz skill's references/palette.md. Slot
// assignment is fixed per category (src/lib/plaid-categories.ts), never
// reassigned by rank, so a category is always the same color.
const vizColor = (slot: number) => `var(--viz-${slot})`;

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
                  <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} />
                  <Legend verticalAlign="bottom" height={48} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center text-center"
                style={{ height: 300 - 48 }}
              >
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-xl font-semibold">{formatCurrency(monthTotal, currency)}</span>
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
                />
                <Bar dataKey="amount" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
