"use client";

import type { CSSProperties } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { ForecastPoint } from "@/lib/forecast";

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const legendStyle: CSSProperties = { fontSize: 12, color: "var(--ash-grey)" };

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ForecastChart({
  points,
  showExpected,
  threshold,
  currency,
}: {
  points: ForecastPoint[];
  showExpected: boolean;
  threshold: number;
  currency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          formatter={(value) => formatCurrency(Number(value), currency)}
          labelFormatter={(date) => shortDate(String(date))}
          contentStyle={tooltipContentStyle}
          labelStyle={{ color: "var(--bone)" }}
          itemStyle={{ color: "var(--popover-foreground)" }}
        />
        <Legend verticalAlign="bottom" height={28} wrapperStyle={legendStyle} />
        <ReferenceLine y={0} stroke="var(--oxblood)" strokeOpacity={0.6} />
        {threshold > 0 && <ReferenceLine y={threshold} stroke="var(--ash-grey)" strokeDasharray="2 4" />}
        <Line
          type="stepAfter"
          dataKey="committed"
          name="Known bills only"
          stroke="var(--champagne)"
          strokeWidth={2.5}
          dot={false}
        />
        {showExpected && (
          <Line
            type="monotone"
            dataKey="expected"
            name="Including typical spending"
            stroke="var(--ash-grey)"
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
