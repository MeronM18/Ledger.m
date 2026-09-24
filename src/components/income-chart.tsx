"use client";

import type { CSSProperties } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { IncomeMonth } from "@/lib/income";

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

/**
 * Income per month as bars (the month in progress drawn fainter, since it
 * isn't finished), spending as a line over them, and two guides: the
 * average month and the lowest one, the baseline to budget around.
 */
export function IncomeChart({
  months,
  average,
  baseline,
  currency,
}: {
  months: IncomeMonth[];
  average: number | null;
  baseline: number | null;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={months} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={tooltipContentStyle}
            labelStyle={{ color: "var(--bone)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
            labelFormatter={(label, payload) => {
              const m = payload?.[0]?.payload as IncomeMonth | undefined;
              return m && !m.complete ? `${label} (so far)` : String(label);
            }}
            formatter={(value, name) => [formatCurrency(Number(value), currency), name]}
          />
          {baseline !== null && baseline > 0 && (
            <ReferenceLine y={baseline} stroke="var(--champagne)" strokeWidth={1.5} />
          )}
          {average !== null && <ReferenceLine y={average} stroke="var(--ash-grey)" strokeDasharray="4 4" />}
          <Bar dataKey="income" name="Income" radius={[3, 3, 0, 0]} maxBarSize={36}>
            {months.map((m) => (
              <Cell key={m.month} fill="var(--moss)" fillOpacity={m.complete ? 0.9 : 0.35} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="spending"
            name="Spending"
            stroke="var(--oxblood-text)"
            strokeWidth={1.75}
            dot={{ r: 2.5, fill: "var(--oxblood-text)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground" aria-label="Chart key">
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-[2px] bg-moss" aria-hidden /> Income
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-oxblood-text" aria-hidden /> Spending
        </li>
        {baseline !== null && baseline > 0 && (
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-4 bg-champagne" aria-hidden /> Lowest month (your baseline)
          </li>
        )}
        {average !== null && (
          <li className="flex items-center gap-2">
            <span className="w-4 border-t border-dashed border-ash-grey" aria-hidden /> Average
          </li>
        )}
      </ul>
    </div>
  );
}
