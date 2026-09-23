"use client";

import type { CSSProperties } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export type NetWorthSnapshotPoint = { date: string; netWorth: number };

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const tooltipLabelStyle: CSSProperties = { color: "var(--bone)" };
const tooltipItemStyle: CSSProperties = { color: "var(--popover-foreground)" };

// A trend line isn't a spend (oxblood) or an income (moss) signal — it's
// the same neutral hero-metric accent the big Net worth number itself uses
// elsewhere (champagne-bordered cards, font-serif figure).
const LINE_COLOR = "var(--champagne)";

// Below this many snapshots, a line chart reads as a single dot or a sharp,
// meaningless two-point slope rather than an actual trend — showing a
// "building history" state instead is more honest than rendering something
// that looks broken.
const MIN_SNAPSHOTS_FOR_CHART = 5;

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NetWorthChart({ snapshots }: { snapshots: NetWorthSnapshotPoint[] }) {
  const data = snapshots.map((s) => ({ ...s, label: formatDateLabel(s.date) }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth over time</CardTitle>
      </CardHeader>
      <CardContent>
        {snapshots.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No net worth history yet.
          </p>
        ) : snapshots.length < MIN_SNAPSHOTS_FOR_CHART ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Building history — {snapshots.length} day{snapshots.length === 1 ? "" : "s"} recorded so far.
            </p>
            <p className="text-xs text-muted-foreground">
              A trend chart will appear once there&apos;s at least {MIN_SNAPSHOTS_FOR_CHART} days of snapshots.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatCompactCurrency(v, "USD")}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={56}
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value), "USD")}
                cursor={{ stroke: "var(--border)" }}
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke={LINE_COLOR}
                strokeWidth={2}
                fill="url(#netWorthFill)"
                dot={data.length <= 14}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
