"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cashFlowReport, type Flow, type FlowNode } from "@/lib/cash-flow-report";
import { formatCurrency } from "@/lib/format";
import type { SpendingTransaction } from "@/lib/spending-aggregation";
import { PERIOD_PRESETS, periodRange, rangeLabel } from "@/lib/spending-report";
import { cn } from "@/lib/utils";

// The diagram is laid out in a fixed box and scales to the card's width.
const W = 1000;
const H = 520;
const NODE_W = 12;
const PAD = 12; // between nodes in a column

type Placed = FlowNode & { x: number; y: number; h: number };
type Band = Flow & { sy: number; ty: number; h: number; source: string; target: string };

function layout(nodes: FlowNode[], flows: Flow[]): { placed: Map<string, Placed>; bands: Band[] } {
  const columns = [0, 1, 2, 3].map((c) => nodes.filter((n) => n.column === c)).filter((c) => c.length > 0);
  const colX = (i: number) => (columns.length === 1 ? 0 : (i / (columns.length - 1)) * (W - NODE_W));
  // One scale for the columns up to the categories, so a dollar is the same
  // height everywhere; the finer categories share it.
  const main = columns.filter((col) => col[0].column <= 2);
  const scale = Math.min(
    ...main.map((col) => (H - PAD * (col.length - 1)) / Math.max(1, col.reduce((s, n) => s + n.amount, 0)))
  );
  const height = (n: FlowNode) => Math.max(1.5, n.amount * scale);
  const placed = new Map<string, Placed>();
  const parentOf = new Map(flows.map((f) => [f.target, f.source]));

  columns.forEach((col, i) => {
    const x = colX(i);
    if (col[0].column === 3) {
      // Finer categories sit beside their category, nudged down only to
      // clear the group above, so their flows run straight across.
      const SUB_GAP = 3;
      let bottom = -Infinity;
      let lastParent: string | undefined;
      for (const n of col) {
        const parent = parentOf.get(n.id);
        const start = parent !== lastParent ? Math.max(placed.get(parent!)?.y ?? 0, bottom + PAD) : bottom + SUB_GAP;
        placed.set(n.id, { ...n, x, y: start, h: height(n) });
        bottom = start + height(n);
        lastParent = parent;
      }
      return;
    }
    const used = col.reduce((s, n) => s + height(n), 0) + PAD * (col.length - 1);
    // Centered in the box when a column is shorter than the others.
    let y = Math.max(0, (H - used) / 2);
    for (const n of col) {
      placed.set(n.id, { ...n, x, y, h: height(n) });
      y += height(n) + PAD;
    }
  });
  // Each node's flows stack down its edge in the order they're listed.
  const outAt = new Map<string, number>();
  const inAt = new Map<string, number>();
  const bands: Band[] = flows.flatMap((f) => {
    const s = placed.get(f.source);
    const t = placed.get(f.target);
    if (!s || !t) return [];
    const h = Math.max(0.75, f.amount * scale);
    const sy = s.y + (outAt.get(f.source) ?? 0);
    const ty = t.y + (inAt.get(f.target) ?? 0);
    outAt.set(f.source, (outAt.get(f.source) ?? 0) + h);
    inAt.set(f.target, (inAt.get(f.target) ?? 0) + h);
    return [{ ...f, sy, ty, h }];
  });
  return { placed, bands };
}

function bandPath(x0: number, x1: number, sy: number, ty: number, h: number): string {
  const mx = (x0 + x1) / 2;
  return `M${x0} ${sy}C${mx} ${sy} ${mx} ${ty} ${x1} ${ty}L${x1} ${ty + h}C${mx} ${ty + h} ${mx} ${sy + h} ${x0} ${sy + h}Z`;
}

function Sankey({ nodes, flows, base }: { nodes: FlowNode[]; flows: Flow[]; base: number }) {
  const { placed, bands } = useMemo(() => layout(nodes, flows), [nodes, flows]);
  const [focus, setFocus] = useState<string | null>(null);
  const lastColumn = Math.max(...nodes.map((n) => n.column));
  const bottom = Math.max(H, ...Array.from(placed.values()).map((n) => n.y + n.h));

  // What's lit while a node is pointed at: it and the money that reaches
  // it and leaves it, followed to the ends (but not fanned out through
  // Income, which everything passes through).
  const lit = useMemo(() => {
    if (!focus) return null;
    const ids = new Set([focus]);
    const walk = (from: string, forward: boolean) => {
      for (const b of bands) {
        const [here, next] = forward ? [b.source, b.target] : [b.target, b.source];
        if (here !== from || ids.has(next)) continue;
        ids.add(next);
        if (next !== "income" || focus === "income") walk(next, forward);
      }
    };
    walk(focus, true);
    walk(focus, false);
    return ids;
  }, [focus, bands]);
  const isLit = (id: string) => lit === null || lit.has(id);
  const bandLit = (b: Band) => lit === null || (lit.has(b.source) && lit.has(b.target));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`-4 -4 ${W + 8} ${bottom + 8}`} className="h-auto w-full min-w-[720px]" role="img" aria-label="Where your money came from and went" onMouseLeave={() => setFocus(null)}>
        <defs>
          {bands.map((b, i) => (
            <linearGradient key={i} id={`flow-${i}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={placed.get(b.source)!.color} />
              <stop offset="100%" stopColor={placed.get(b.target)!.color} />
            </linearGradient>
          ))}
        </defs>
        {bands.map((b, i) => {
          const s = placed.get(b.source)!;
          const t = placed.get(b.target)!;
          return (
            <path
              key={i}
              d={bandPath(s.x + NODE_W, t.x, b.sy, b.ty, b.h)}
              fill={`url(#flow-${i})`}
              style={{ opacity: bandLit(b) ? (lit ? 0.5 : 0.28) : 0.06, transition: "opacity 200ms ease" }}
            />
          );
        })}
        {Array.from(placed.values()).map((n) => {
          // Labels sit after the bar, except in the last columns, where they sit before it.
          const before = n.column >= 2 && (n.column === lastColumn || n.column === 3 || lastColumn === 3);
          const tx = before ? n.x - 8 : n.x + NODE_W + 8;
          const showLabel = n.h >= 8;
          const showAmount = n.h >= 24 || n.column <= 1;
          const cy = n.y + n.h / 2;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setFocus(n.id)}
              className="cursor-default"
              style={{ opacity: isLit(n.id) ? 1 : 0.3, transition: "opacity 200ms ease" }}
            >
              <title>{`${n.label}: ${formatCurrency(n.amount, "USD")} (${((n.amount / base) * 100).toFixed(1)}%)`}</title>
              <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={2} fill={n.color} />
              {/* A wider invisible target, so thin bars are easy to point at. */}
              <rect x={n.x - 6} y={n.y - 3} width={NODE_W + 12} height={n.h + 6} fill="transparent" />
              {showLabel && (
                <text x={tx} y={showAmount ? cy - 3 : cy + 4} textAnchor={before ? "end" : "start"} className="fill-bone text-[13px]">
                  {n.label}
                  {showAmount && (
                    <tspan x={tx} dy={17} className="fill-muted-foreground font-mono text-[12px]">
                      {formatCurrency(n.amount, "USD")} ({((n.amount / base) * 100).toFixed(1)}%)
                    </tspan>
                  )}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col items-center gap-1 py-2 text-center">
        <span
          className={cn(
            "font-mono text-xl font-semibold tabular-nums",
            tone === "positive" ? "text-moss" : tone === "negative" ? "text-oxblood-text" : "text-bone"
          )}
        >
          {value}
        </span>
        <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</span>
      </CardContent>
    </Card>
  );
}

/**
 * Reports → Cash flow, looking back: income, expenses, what was kept and
 * the savings rate for a period, and a diagram of where the money came from
 * and went.
 */
export function CashFlowFlows({ transactions, connectedCardIssuers }: { transactions: SpendingTransaction[]; connectedCardIssuers: string[] }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const [period, setPeriod] = useState("this-month");
  const range = useMemo(() => periodRange(period, today), [period, today]);
  const report = useMemo(() => cashFlowReport(transactions, connectedCardIssuers, range), [transactions, connectedCardIssuers, range]);

  const months = useMemo(() => {
    const present = new Set(transactions.map((t) => t.date.slice(0, 7)));
    return Array.from(present)
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({ value: m, label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) }));
  }, [transactions]);
  const earliest = months.length > 0 ? `${months[months.length - 1].value}-01` : null;
  const base = report.nodes.find((n) => n.id === "income")?.amount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger aria-label="Period" className="min-w-40">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end" className="max-h-80">
            <SelectGroup>
              {PERIOD_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>A month</SelectLabel>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total income" value={formatCurrency(report.income, "USD")} tone="positive" />
        <Stat label="Total expenses" value={formatCurrency(report.expenses, "USD")} tone="negative" />
        <Stat label="Net income" value={formatCurrency(report.net, "USD")} tone={report.net >= 0 ? undefined : "negative"} />
        <Stat label="Savings rate" value={report.savingsRate === null ? "—" : `${(report.savingsRate * 100).toFixed(1)}%`} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Cash flow</p>
          <p className="text-base font-medium text-bone">{rangeLabel(range, today, earliest)}</p>
        </CardHeader>
        <CardContent>
          {report.nodes.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Nothing came in or went out in this period.</p>
          ) : (
            <Sankey nodes={report.nodes} flows={report.flows} base={base} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Income is money in marked as income. Expenses count the way Spending and Budgets do: posted charges, net of
            refunds, your share of anything paid back. Transfers between your own accounts are left out. Point at a bar to
            follow its money.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
