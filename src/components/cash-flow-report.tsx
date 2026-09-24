"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ChartColumnStacked, LayoutDashboard } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  cashFlowReport,
  cashFlowSeries,
  squarify,
  treemapTiles,
  type CashFlowReport,
  type Flow,
  type FlowNode,
  type CashFlowSeries,
  type FlowBucket,
} from "@/lib/cash-flow-report";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { SpendingTransaction } from "@/lib/spending-aggregation";
import { PERIOD_PRESETS, periodRange, rangeLabel } from "@/lib/spending-report";
import { cn } from "@/lib/utils";

// The diagram is laid out at the card's own width (so text stays its real
// size), never narrower than MIN_W, which scrolls on a phone.
const MIN_W = 720;
const H = 560;
const NODE_W = 14;
const PAD = 8; // between nodes in a column

type Placed = FlowNode & { x: number; y: number; h: number };
type Band = Flow & { sy: number; ty: number; h: number; source: string; target: string };

function layout(nodes: FlowNode[], flows: Flow[], W: number): { placed: Map<string, Placed>; bands: Band[] } {
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
      const SUB_GAP = 4;
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

/** The width of an element, kept up to date as it resizes. */
function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observe = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [observe, width];
}

const LINE = 17; // a label's line height
type LabelFit = "full" | "name" | "none";

/**
 * How much of each label fits: name and amount, the name alone, or none,
 * top to bottom down each column, so no two labels overlap. (Hovering a
 * bar still names it.)
 */
function fitLabels(placed: Map<string, Placed>): Map<string, LabelFit> {
  const fit = new Map<string, LabelFit>();
  const byColumn = new Map<number, Placed[]>();
  for (const n of placed.values()) byColumn.set(n.column, [...(byColumn.get(n.column) ?? []), n]);
  for (const col of byColumn.values()) {
    let lastBottom = -Infinity;
    for (const n of [...col].sort((a, b) => a.y - b.y)) {
      const cy = n.y + n.h / 2;
      const full = { top: cy - LINE, bottom: cy + LINE };
      const name = { top: cy - LINE / 2 - 2, bottom: cy + LINE / 2 };
      if (full.top >= lastBottom + 2) {
        fit.set(n.id, "full");
        lastBottom = full.bottom;
      } else if (name.top >= lastBottom + 2) {
        fit.set(n.id, "name");
        lastBottom = name.bottom;
      } else fit.set(n.id, "none");
    }
  }
  return fit;
}

function Sankey({ nodes, flows, base }: { nodes: FlowNode[]; flows: Flow[]; base: number }) {
  const [measure, measured] = useWidth();
  // The svg carries 4px of breathing room each side.
  const W = Math.max(MIN_W, (measured || 1008) - 8);
  const { placed, bands } = useMemo(() => layout(nodes, flows, W), [nodes, flows, W]);
  const labels = useMemo(() => fitLabels(placed), [placed]);
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
    <div ref={measure} className="overflow-x-auto">
      <svg viewBox={`-4 -4 ${W + 8} ${bottom + 8}`} width={W + 8} height={bottom + 8} className="block max-w-none" role="img" aria-label="Where your money came from and went" onMouseLeave={() => setFocus(null)}>
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
              style={{ opacity: bandLit(b) ? (lit ? 0.62 : 0.4) : 0.07, transition: "opacity 200ms ease" }}
            />
          );
        })}
        {Array.from(placed.values()).map((n) => {
          // Labels sit after the bar, except in the last columns, where they sit before it.
          const before = n.column >= 2 && (n.column === lastColumn || n.column === 3 || lastColumn === 3);
          const tx = before ? n.x - 8 : n.x + NODE_W + 8;
          const fit = labels.get(n.id) ?? "none";
          const showLabel = fit !== "none";
          const showAmount = fit === "full";
          const cy = n.y + n.h / 2;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setFocus(n.id)}
              className="cursor-default"
              style={{ opacity: isLit(n.id) ? 1 : 0.3, transition: "opacity 200ms ease" }}
            >
              <title>{`${n.label}: ${formatCurrency(n.amount, "USD")} (${((n.amount / base) * 100).toFixed(1)}%)`}</title>
              <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={3} fill={n.color} />
              {/* A wider invisible target, so thin bars are easy to point at. */}
              <rect x={n.x - 6} y={n.y - 3} width={NODE_W + 12} height={n.h + 6} fill="transparent" />
              {showLabel && (
                <text
                  x={tx}
                  y={showAmount ? cy - 4 : cy + 4}
                  textAnchor={before ? "end" : "start"}
                  // A halo in the card's color keeps a label readable where it crosses a flow.
                  stroke="var(--card)"
                  strokeOpacity={0.55}
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  className="fill-bone/75 text-[12px]"
                >
                  {/* The name light, the amount bold beneath it. */}
                  {n.label}
                  {showAmount && (
                    <tspan x={tx} dy={16} className="fill-bone text-[13px] font-semibold tabular-nums">
                      {formatCurrency(n.amount, "USD")}
                      <tspan className="fill-ash-grey font-normal"> ({((n.amount / base) * 100).toFixed(2)}%)</tspan>
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

// ---- Treemap ----------------------------------------------------------------

const TREE_H = 460;
const GAP_PX = 3;
const HEADER = 34; // a category's name strip, when its tile is big enough

/** A tile's fill: its color mixed down into the card, lighter for the larger parts. */
const shade = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, var(--card))`;

function Treemap({ report }: { report: CashFlowReport }) {
  const [measure, measured] = useWidth();
  const W = Math.max(320, measured || 1000);
  const [hover, setHover] = useState<string | null>(null);
  const base = report.nodes.find((n) => n.id === "income")?.amount ?? 0;
  const tiles = useMemo(() => treemapTiles(report), [report]);

  const layoutTiles = useMemo(() => {
    const rects = squarify(tiles.map((t) => t.amount), { x: 0, y: 0, w: W, h: TREE_H });
    return tiles.map((t, i) => {
      const r = rects[i];
      const inner = { x: r.x + GAP_PX / 2, y: r.y + GAP_PX / 2, w: Math.max(0, r.w - GAP_PX), h: Math.max(0, r.h - GAP_PX) };
      const withHeader = t.children.length > 1 && inner.h > HEADER + 40 && inner.w > 110;
      const body = withHeader ? { ...inner, y: inner.y + HEADER, h: inner.h - HEADER } : inner;
      const kids =
        t.children.length > 1
          ? squarify(t.children.map((c) => c.amount), body).map((cr, k) => ({ ...t.children[k], rect: cr }))
          : [];
      return { ...t, rect: inner, withHeader, kids };
    });
  }, [tiles, W]);

  const hovered =
    layoutTiles.flatMap((t) => [{ ...t, parent: null as string | null }, ...t.kids.map((k) => ({ ...k, parent: t.label, color: t.color }))]).find((x) => x.id === hover) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div ref={measure}>
        <svg width={W} height={TREE_H} className="block" role="img" aria-label="Where your money went, as tiles" onMouseLeave={() => setHover(null)}>
          {layoutTiles.map((t) => {
            const r = t.rect;
            const dim = hover !== null && hover !== t.id && !t.kids.some((k) => k.id === hover);
            return (
              <g key={t.id} style={{ opacity: dim ? 0.6 : 1, transition: "opacity 200ms ease" }}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={6}
                  fill={shade(t.color, hover === t.id ? 78 : 62)}
                  onMouseEnter={() => setHover(t.id)}
                  style={{ transition: "fill 200ms ease" }}
                >
                  <title>{`${t.label}: ${formatCurrency(t.amount, "USD")} (${((t.amount / base) * 100).toFixed(1)}% of income)`}</title>
                </rect>
                {t.kids.map((k, idx) => {
                  const kr = { x: k.rect.x + 1.5, y: k.rect.y + 1.5, w: Math.max(0, k.rect.w - 3), h: Math.max(0, k.rect.h - 3) };
                  const fits = kr.w > 64 && kr.h > 34;
                  return (
                    <g key={k.id} onMouseEnter={() => setHover(k.id)}>
                      <rect
                        x={kr.x}
                        y={kr.y}
                        width={kr.w}
                        height={kr.h}
                        rx={4}
                        fill={shade(t.color, hover === k.id ? 92 : Math.max(46, 82 - idx * 9))}
                        style={{ transition: "fill 200ms ease" }}
                      >
                        <title>{`${t.label} › ${k.label}: ${formatCurrency(k.amount, "USD")} (${((k.amount / base) * 100).toFixed(1)}% of income)`}</title>
                      </rect>
                      {fits && (
                        <text x={kr.x + 8} y={kr.y + 17} className="pointer-events-none fill-bone text-[12px]">
                          {truncate(k.label, kr.w - 16, 6.6)}
                          {kr.h > 44 && (
                            <tspan x={kr.x + 8} dy={16} className="fill-bone/70 font-mono text-[11px]">
                              {formatCurrency(k.amount, "USD")}
                            </tspan>
                          )}
                        </text>
                      )}
                    </g>
                  );
                })}
                {(t.withHeader || t.kids.length === 0) && r.w > 70 && r.h > 34 && (() => {
                  const amount = `${formatCurrency(t.amount, "USD")} · ${((t.amount / base) * 100).toFixed(1)}%`;
                  // The amount beside the name only when both fit; else beneath it, if there's room.
                  const inline = t.label.length * 7.4 + amount.length * 7 + 36 <= r.w;
                  return (
                    <text x={r.x + 10} y={r.y + 21} className="pointer-events-none fill-bone text-[13px] font-medium">
                      {truncate(t.label, r.w - 20, 7.4)}
                      {inline ? (
                        <tspan className="fill-bone/70 font-mono text-[11.5px] font-normal">{`  ${amount}`}</tspan>
                      ) : (
                        t.kids.length === 0 &&
                        r.h > 50 && (
                          <tspan x={r.x + 10} dy={17} className="fill-bone/70 font-mono text-[11.5px] font-normal">
                            {truncate(amount, r.w - 20, 7)}
                          </tspan>
                        )
                      )}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {hovered ? (
          <>
            <span className="text-bone">{hovered.parent ? `${hovered.parent} › ${hovered.label}` : hovered.label}</span>
            {" · "}
            <span className="font-mono text-bone tabular-nums">{formatCurrency(hovered.amount, "USD")}</span>
            {" · "}
            {((hovered.amount / base) * 100).toFixed(1)}% of income
          </>
        ) : (
          "Each tile is as big as its share of your income. Point at one for its details."
        )}
      </p>
    </div>
  );
}

/** Cut a label to about `width` pixels at `perChar` pixels a character. */
function truncate(text: string, width: number, perChar: number): string {
  const max = Math.floor(width / perChar);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

// ---- Over time --------------------------------------------------------------

// Money in wears income's green, as on the cards above (the sky blue is Travel's).
const IN_COLOR = "var(--cat-income)";

function OverTimeTooltip({
  active,
  payload,
  data,
}: {
  active?: boolean;
  payload?: { payload: FlowBucket }[];
  data: CashFlowSeries;
}) {
  if (!active || !payload?.[0]) return null;
  const b = payload[0].payload;
  const parts = data.series.filter((s) => (b.byCategory[s.key] ?? 0) > 0).sort((x, y) => (b.byCategory[y.key] ?? 0) - (b.byCategory[x.key] ?? 0));
  const when =
    data.granularity === "day"
      ? new Date(`${b.key}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", timeZone: "UTC" })
      : new Date(`${b.key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="min-w-56 rounded-md border border-border bg-popover p-3 text-xs shadow-lg">
      <p className="mb-2 font-medium text-bone">{when}</p>
      <div className="flex flex-col gap-1">
        <Row label="Money in" value={b.income} className="text-[var(--cat-income)]" />
        <Row label="Money out" value={b.expenses} className="text-bone" />
      </div>
      {parts.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {parts.map((sr) => (
            <div key={sr.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: sr.color }} />
                {sr.label}
              </span>
              <span className="font-mono text-bone tabular-nums">{formatCurrency(b.byCategory[sr.key], "USD")}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-2">
        <span className="text-muted-foreground">Kept so far</span>
        <span className={cn("font-mono font-semibold tabular-nums", b.keptSoFar < 0 ? "text-oxblood-text" : "text-champagne")}>
          {b.keptSoFar < 0 ? "−" : ""}
          {formatCurrency(Math.abs(b.keptSoFar), "USD")}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", className)}>{formatCurrency(value, "USD")}</span>
    </div>
  );
}

const OUT_COLOR = "var(--oxblood)";

/**
 * When money came in and went out: a pair of bars for each day (a period up
 * to two months) or month, money in beside money out. Hovering a pair lists
 * each category and what's been kept so far in the period.
 */
function OverTime({ data }: { data: CashFlowSeries }) {
  const rows = data.buckets.map((b) => ({ ...b, moneyIn: b.income, moneyOut: Math.max(0, b.expenses) }));
  const daily = data.granularity === "day";
  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer {...CHART_RESIZE} width="100%" height={380}>
        <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap={daily ? "18%" : "24%"} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={daily ? 18 : 8} />
          <YAxis
            tickFormatter={(v: number) => formatCompactCurrency(v, "USD")}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip {...chartTooltipProps} cursor={{ fill: "var(--muted)", opacity: 0.45 }} content={<OverTimeTooltip data={data} />} />
          <Bar dataKey="moneyIn" name="Money in" fill={IN_COLOR} fillOpacity={0.9} radius={[3, 3, 0, 0]} maxBarSize={daily ? 14 : 36} isAnimationActive={false} />
          <Bar dataKey="moneyOut" name="Money out" fill={OUT_COLOR} fillOpacity={0.9} radius={[3, 3, 0, 0]} maxBarSize={daily ? 14 : 36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: IN_COLOR }} />
          Money in
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: OUT_COLOR }} />
          Money out
        </li>
      </ul>
    </div>
  );
}

/** The Sankey's icon: bars joined by curving flows. */
function FlowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" className={className} aria-hidden>
      <path d="M2 3v10M14 2v4M14 9v5" />
      <path d="M2 5c6 0 6-2 12-2M2 11c6 0 6 1.5 12 1.5" />
    </svg>
  );
}

type ChartKind = "flow" | "treemap" | "bars";

export function CashFlowFlows({ transactions, connectedCardIssuers }: { transactions: SpendingTransaction[]; connectedCardIssuers: string[] }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const [period, setPeriod] = useState("this-month");
  const range = useMemo(() => periodRange(period, today), [period, today]);
  const report = useMemo(() => cashFlowReport(transactions, connectedCardIssuers, range), [transactions, connectedCardIssuers, range]);
  const [chart, setChart] = useState<ChartKind>("flow");

  const months = useMemo(() => {
    const present = new Set(transactions.map((t) => t.date.slice(0, 7)));
    return Array.from(present)
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({ value: m, label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) }));
  }, [transactions]);
  const earliest = months.length > 0 ? `${months[months.length - 1].value}-01` : null;
  const base = report.nodes.find((n) => n.id === "income")?.amount ?? 0;
  const overTime = useMemo(
    () => (chart === "bars" ? cashFlowSeries(transactions, connectedCardIssuers, range, today, earliest) : null),
    [chart, transactions, connectedCardIssuers, range, today, earliest]
  );

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
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Cash flow</p>
            <p className="text-base font-medium text-bone">{rangeLabel(range, today, earliest)}</p>
          </div>
          <div role="radiogroup" aria-label="Chart" className="flex rounded-md border border-border p-0.5">
            {(
              [
                { value: "flow", label: "Flow", icon: <FlowIcon className="size-3.5" /> },
                { value: "treemap", label: "Treemap", icon: <LayoutDashboard className="size-3.5" /> },
                { value: "bars", label: "Over time", icon: <ChartColumnStacked className="size-3.5" /> },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={chart === o.value}
                aria-label={o.label}
                title={o.label}
                onClick={() => setChart(o.value)}
                className={cn(
                  "inline-flex items-center rounded-[5px] px-2.5 py-1.5 transition-colors",
                  chart === o.value ? "bg-bone/10 text-bone" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {o.icon}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {chart === "bars" && overTime ? (
            <OverTime data={overTime} />
          ) : report.nodes.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Nothing came in or went out in this period.</p>
          ) : chart === "treemap" ? (
            <Treemap report={report} />
          ) : (
            <Sankey nodes={report.nodes} flows={report.flows} base={base} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Income is money in marked as income. Expenses count the way Spending and Budgets do: posted charges, net of
            refunds, your share of anything paid back. Transfers between your own accounts are left out.
            {chart === "flow" && " Point at a bar to follow its money."}
            {chart === "bars" &&
              (overTime?.granularity === "day"
                ? " A pair of bars a day: money in beside money out. Hover a day for its categories and what you've kept so far."
                : " A pair of bars a month: money in beside money out. Hover a month for its categories and what you've kept so far.")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
