"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronRight,
  Clock,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Area, ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { addDays, daysBetween } from "@/lib/account-history";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { dateTicks, formatTickMoney, valueTicks } from "@/lib/day-chart";
import { formatCurrency } from "@/lib/format";
import { dollars, fullDate, roughDate, roughGap, shortDate, VERDICT } from "@/lib/goal-copy";
import type { GoalInsight, PaySummary } from "@/lib/goal-insights";
import { GOAL_COLORS, GOAL_ICONS, colorVar, type GoalColor, type GoalIcon, type GoalOptions } from "@/lib/goal-options";
import { GoalBadge, ICON_COMPONENTS, accentFor, iconFor } from "@/components/goal-look";
import { monthsUntil, type GoalProgress } from "@/lib/goals";
import { projectGoal } from "@/lib/goal-projection";
import { cn } from "@/lib/utils";

export type GoalRow = GoalProgress & {
  options: GoalOptions;
  savedManual: number;
  accountRefs: string[];
  // Names of the accounts it follows that have a balance, in the order chosen.
  accountNames: string[];
  // The same names by account ref.
  accountLabels: Record<string, string>;
  insight: GoalInsight;
};
// "asset": something tracked by hand on Accounts (cash, crypto), which has a value but no transactions.
export type AccountChoice = { id: string; label: string; balance: number | null; kind: "account" | "asset" };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Something went wrong");
  }
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

// ---- Adding and editing ----------------------------------------------------

type TrackMode = "balance" | "growth" | "hand";

const TRACK_MODES: { value: TrackMode; label: string; help: string }[] = [
  { value: "balance", label: "Account balances", help: "What's in the accounts you pick counts. Take a share of one when it holds more than this goal." },
  { value: "growth", label: "New money only", help: "Only what's added to the accounts from today counts, not what's already there." },
  { value: "hand", label: "By hand", help: "Enter what you've saved and add to it as you go." },
];

function GoalDialog({
  goal,
  accounts,
  pay,
  today,
  trigger,
  preset,
  defaultOpen = false,
  onClosed,
}: {
  goal?: GoalRow;
  accounts: AccountChoice[];
  pay: PaySummary | null;
  today: string;
  // What opens it; none when it's opened from a menu (defaultOpen) and removed once closed (onClosed).
  trigger?: React.ReactNode;
  // A starting point for a new goal (from the ideas), filled in when it opens.
  preset?: { name: string; icon: GoalIcon; color: GoalColor };
  defaultOpen?: boolean;
  onClosed?: () => void;
}) {
  const router = useRouter();
  const [open, setOpenState] = useState(defaultOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) onClosed?.();
  };
  const [saving, setSaving] = useState(false);
  // Filled in from the goal (or the idea) when it opens.
  const [name, setName] = useState(goal?.name ?? preset?.name ?? "");
  const [target, setTarget] = useState(goal ? String(goal.target) : "");
  const [saved, setSaved] = useState(goal ? String(goal.savedManual) : "");
  const [date, setDate] = useState(goal?.targetDate ?? "");
  const [mode, setMode] = useState<TrackMode>(goal ? (goal.accountRefs.length === 0 ? "hand" : goal.options.tracking) : "balance");
  const [icon, setIcon] = useState<GoalIcon | null>(goal?.options.icon ?? preset?.icon ?? null);
  const [color, setColor] = useState<GoalColor | null>(goal?.options.color ?? preset?.color ?? null);
  // Refs ("plaid:<id>" / "manual:<id>" / "asset:<id>") of what this goal follows.
  const [followed, setFollowed] = useState<string[]>(goal?.accountRefs ?? []);
  // Percent of each followed account that counts; missing is all of it.
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(goal?.options.shares ?? {}).map(([k, v]) => [k, String(v)]))
  );

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(goal?.name ?? preset?.name ?? "");
      setTarget(goal ? String(goal.target) : "");
      setSaved(goal ? String(goal.savedManual) : "");
      setDate(goal?.targetDate ?? "");
      setFollowed(goal?.accountRefs ?? []);
      setMode(goal ? (goal.accountRefs.length === 0 ? "hand" : goal.options.tracking) : "balance");
      setIcon(goal?.options.icon ?? preset?.icon ?? null);
      setColor(goal?.options.color ?? preset?.color ?? null);
      setShares(Object.fromEntries(Object.entries(goal?.options.shares ?? {}).map(([k, v]) => [k, String(v)])));
    }
    setOpen(next);
  }

  const shareOf = (ref: string) => {
    const v = Number(shares[ref]);
    return shares[ref] && Number.isFinite(v) && v > 0 && v <= 100 ? v : 100;
  };

  // What the goal as typed would take, before it's saved.
  const preview = (() => {
    const targetValue = Number(target);
    if (!target || !Number.isFinite(targetValue) || targetValue <= 0) return null;
    const have =
      mode === "hand"
        ? Number(saved) || 0
        : mode === "growth"
          ? (goal?.options.tracking === "growth" ? goal.saved : 0)
          : followed.reduce((s, ref) => s + ((accounts.find((a) => a.id === ref)?.balance ?? 0) * shareOf(ref)) / 100, 0);
    const remaining = targetValue - have;
    if (remaining <= 0) return `${dollars(have)} is already there, so this goal starts out reached.`;
    if (!date) return `${dollars(remaining)} to go. Add a date to see what it takes each month.`;
    const months = monthsUntil(today, date);
    if (months === null) return "That date has passed. Pick one ahead.";
    const perMonth = remaining / months;
    const share = pay?.typicalMonth ? perMonth / pay.typicalMonth : null;
    return `That's ${dollars(perMonth)} a month for ${months} month${months === 1 ? "" : "s"}${
      share !== null ? `, about ${percent(share)} of a typical month's pay` : ""
    }.`;
  })();

  async function handleSave() {
    const targetValue = Number(target);
    const savedValue = saved === "" ? 0 : Number(saved);
    if (!name.trim() || !Number.isFinite(targetValue) || targetValue <= 0 || !Number.isFinite(savedValue) || savedValue < 0) {
      toast.error("Enter a name, a target above 0, and an amount saved of 0 or more");
      return;
    }
    if (mode !== "hand" && followed.length === 0) {
      toast.error("Pick at least one account to follow, or track it by hand");
      return;
    }
    setSaving(true);
    try {
      const refs = mode === "hand" ? [] : followed;
      const payload = {
        name: name.trim(),
        target_amount: targetValue,
        // Only sent when tracking by hand, so linking an account and
        // unlinking later doesn't wipe the amount saved before.
        ...(mode === "hand" ? { saved_amount: savedValue } : {}),
        target_date: date || null,
        account_refs: refs,
        options: {
          icon,
          color,
          tracking: mode === "growth" ? "growth" : "balance",
          shares: Object.fromEntries(refs.filter((ref) => shareOf(ref) < 100).map((ref) => [ref, shareOf(ref)])),
        },
      };
      if (goal) await send(`/api/goals/${goal.id}`, "PATCH", payload);
      else await send("/api/goals", "POST", payload);
      toast.success(goal ? "Goal updated" : "Goal added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  const groups = [
    { title: "Accounts", items: accounts.filter((a) => a.kind === "account") },
    { title: "Assets you track", items: accounts.filter((a) => a.kind === "asset") },
  ].filter((g) => g.items.length > 0);
  const lookName = name || goal?.name || preset?.name || "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle>
          <DialogDescription>What you&apos;re saving for, by when, and where the money sits.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex items-end gap-3">
            <GoalBadge name={lookName} options={{ icon, color }} className="size-10" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="goal-name">Name</Label>
              <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input id="goal-target" type="number" min="0" step="1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-date">Target date (optional)</Label>
              <Input id="goal-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Look</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
              {GOAL_ICONS.map((key) => {
                const Icon = ICON_COMPONENTS[key];
                const active = iconFor(lookName, { icon }) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={key.replace("-", " ")}
                    onClick={() => setIcon(key)}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md transition-colors",
                      active ? "bg-bone/12 text-bone ring-1 ring-bone/20 ring-inset" : "text-muted-foreground hover:bg-bone/6 hover:text-bone"
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 pt-1" role="radiogroup" aria-label="Color">
              {GOAL_COLORS.map((key) => {
                const active = (color ?? "champagne") === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={key}
                    onClick={() => setColor(key)}
                    className={cn("size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow", active ? "ring-2 ring-bone/70" : "hover:ring-2 hover:ring-bone/25")}
                    style={{ backgroundColor: colorVar(key) }}
                  />
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Track progress</legend>
            <div role="radiogroup" aria-label="Track progress" className="grid grid-cols-3 gap-1 rounded-lg border border-border p-1">
              {TRACK_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs transition-colors",
                    mode === m.value ? "bg-bone/12 font-medium text-bone ring-1 ring-bone/10 ring-inset hover:bg-bone/16" : "text-muted-foreground hover:bg-bone/6 hover:text-bone"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{TRACK_MODES.find((m) => m.value === mode)!.help}</p>

            {mode !== "hand" &&
              (groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">No accounts to follow yet. Track it by hand for now.</p>
              ) : (
                <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-lg border border-border p-2">
                  {groups.map((g) => (
                    <div key={g.title} className="flex flex-col gap-1">
                      <span className="px-2 pb-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{g.title}</span>
                      {g.items.map((a) => {
                        const checked = followed.includes(a.id);
                        const share = Number(shares[a.id] ?? "100");
                        // What of it counts toward this goal, when only a share of it does.
                        const counted = checked && a.balance !== null && share > 0 && share < 100 ? (a.balance * share) / 100 : null;
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-2 py-2 transition-colors",
                              checked ? "bg-bone/[0.07] ring-1 ring-bone/10 ring-inset" : "hover:bg-bone/[0.04]"
                            )}
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setFollowed((f) => (checked ? f.filter((x) => x !== a.id) : [...f, a.id]))}
                                className="size-4 shrink-0 accent-[var(--champagne)]"
                              />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className={cn("truncate text-sm", checked ? "text-bone" : "text-bone/85")} title={a.label}>
                                  {a.label}
                                </span>
                                {a.balance !== null && (
                                  <span className="font-mono text-xs text-bone/60 tabular-nums">
                                    {formatCurrency(a.balance, "USD")}
                                    {counted !== null && <span className="font-sans text-champagne"> · counts {formatCurrency(counted, "USD")}</span>}
                                  </span>
                                )}
                              </span>
                            </label>
                            {checked && (
                              <span className="relative flex shrink-0 items-center">
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={100}
                                  aria-label={`Share of ${a.label} that counts`}
                                  value={shares[a.id] ?? "100"}
                                  onChange={(e) => setShares((s) => ({ ...s, [a.id]: e.target.value }))}
                                  className="h-8 w-[4.75rem] [appearance:textfield] pr-7 text-right font-mono text-sm text-bone tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <span className="pointer-events-none absolute right-2.5 text-xs text-bone/60">%</span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}

            {mode === "hand" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goal-saved">Saved so far</Label>
                <Input id="goal-saved" type="number" min="0" step="1" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" />
              </div>
            )}
          </fieldset>

          {preview && (
            <p aria-live="polite" className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              {preview}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : goal ? "Save changes" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyDialog({ goal }: { goal: GoalRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");

  async function handleSave() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      toast.error("Enter an amount (use a minus sign to take money out)");
      return;
    }
    setSaving(true);
    try {
      await send(`/api/goals/${goal.id}`, "PATCH", { add_amount: value });
      toast.success(value > 0 ? "Added to your goal" : "Removed from your goal");
      setOpen(false);
      setAmount("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update goal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" />
          Add money
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to {goal.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-add">Amount</Label>
          <Input id="goal-add" type="number" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The page's "New goal" button. */
export function NewGoalButton({ accounts, pay, today }: { accounts: AccountChoice[]; pay: PaySummary | null; today: string }) {
  return (
    <GoalDialog
      accounts={accounts}
      pay={pay}
      today={today}
      trigger={
        <Button size="sm">
          <Plus className="size-3.5" />
          New goal
        </Button>
      }
    />
  );
}

// ---- The trajectory ---------------------------------------------------------

type ChartPoint = { t: number; saved?: number; pace?: number; need?: number };

const DAY_MS = 86_400_000;
const tOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
// The chart looks back this far, so the road ahead keeps most of the width.
const LOOKBACK_DAYS = 180;

const tooltipStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  padding: "8px 10px",
};

/**
 * The amount saved day by day, then the straight path from today that
 * reaches the target on its date (dashed). A goal with no date shows where
 * the pace of the last few months leads instead (dotted).
 */
function GoalChart({ goal, today }: { goal: GoalRow; today: string }) {
  const { insight } = goal;
  const model = useMemo(() => {
    const history = insight.history!;
    const from = Math.max(0, history.values.length - 1 - LOOKBACK_DAYS);
    const start = tOf(addDays(history.start, from));
    const points: ChartPoint[] = history.values.slice(from).map((v, i) => ({ t: start + i * DAY_MS, saved: v }));

    // The road ahead: to the date, or for an open goal to where the pace lands it (within two years).
    const dated = goal.targetDate !== null && goal.targetDate > today;
    const end = dated
      ? goal.targetDate!
      : insight.verdict === "open" && insight.reachDate
        ? [insight.reachDate, addDays(today, 730)].sort()[0]
        : null;
    if (end && goal.status !== "complete") {
      const now = points[points.length - 1];
      const days = daysBetween(today, end);
      const showPace = !dated && insight.pace !== null;
      if (showPace) now.pace = now.saved;
      if (dated) now.need = now.saved;
      points.push({
        t: tOf(end),
        pace: showPace ? (now.saved ?? 0) + (insight.pace!.perMonth * days) / (365.25 / 12) : undefined,
        need: dated ? goal.target : undefined,
      });
    }

    const highest = Math.max(goal.target, ...points.flatMap((p) => [p.saved ?? 0, p.pace ?? 0]));
    const yTicks = valueTicks(0, highest, 4);
    const x = dateTicks(points[0].t, points[points.length - 1].t, 6);
    const hasPace = points.some((p) => p.pace !== undefined);
    return { points, yTicks, xTicks: x.ticks, xLabel: x.label, future: end !== null && goal.status !== "complete", hasPace };
  }, [insight, goal.targetDate, goal.status, goal.target, today]);

  const yStep = model.yTicks.length > 1 ? model.yTicks[1] - model.yTicks[0] : 1;
  const label = `${goal.name}: saved over time${model.future ? (model.hasPace ? ", and where your pace leads" : ", and the path that reaches the target on time") : ""}.`;

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div role="group" aria-label={label}>
        <ResponsiveContainer {...CHART_RESIZE} width="100%" height={200}>
          <ComposedChart data={model.points} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`goalFill-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--champagne)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--champagne)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={model.xTicks}
              tickFormatter={model.xLabel}
              interval="preserveStartEnd"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              domain={[model.yTicks[0], model.yTicks[model.yTicks.length - 1]]}
              ticks={model.yTicks}
              interval={0}
              allowDataOverflow
              tickFormatter={(v: number) => formatTickMoney(v, yStep)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <ReferenceLine
              y={goal.target}
              stroke="var(--bone)"
              strokeOpacity={0.35}
              strokeDasharray="1 3"
              label={{ value: `Target ${dollars(goal.target)}`, position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11, dy: -12 }}
            />
            <Tooltip
              {...chartTooltipProps}
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as ChartPoint | undefined;
                if (!active || !p) return null;
                const iso = new Date(p.t).toISOString().slice(0, 10);
                const rows: [string, number | undefined][] = [
                  ["Saved", p.saved],
                  ["At your pace", p.t > tOf(today) ? p.pace : undefined],
                  ["On track", p.t > tOf(today) ? p.need : undefined],
                ];
                return (
                  <div style={tooltipStyle}>
                    <p className="mb-1 text-bone">{iso === today ? `Today, ${fullDate(iso)}` : fullDate(iso)}</p>
                    {rows
                      .filter(([, v]) => v !== undefined)
                      .map(([name, v]) => (
                        <p key={name} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono tabular-nums">{formatCurrency(v!, "USD")}</span>
                        </p>
                      ))}
                  </div>
                );
              }}
            />
            <Area
              type="linear"
              dataKey="saved"
              stroke="var(--champagne)"
              strokeWidth={1.75}
              fill={`url(#goalFill-${goal.id})`}
              activeDot={{ r: 4, fill: "var(--champagne)", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="need"
              stroke="var(--muted-foreground)"
              strokeWidth={1.25}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="pace"
              stroke="var(--champagne)"
              strokeWidth={1.75}
              strokeDasharray="1 4"
              strokeLinecap="round"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {model.future && (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="6" aria-hidden>
              <line x1="0" y1="3" x2="16" y2="3" stroke="var(--champagne)" strokeWidth="2" />
            </svg>
            Saved
          </span>
          {model.hasPace && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden>
                <line x1="1" y1="3" x2="16" y2="3" stroke="var(--champagne)" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />
              </svg>
              At your pace
            </span>
          )}
          {goal.targetDate && goal.targetDate > today && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden>
                <line x1="0" y1="3" x2="16" y2="3" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="6 4" />
              </svg>
              On track to finish on time
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

// ---- Month by month ----------------------------------------------------------

const monthName = (key: string, length: "short" | "long" = "short") =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: length, timeZone: "UTC" });

/** A ledger account id from a goal's account ref, for a link to its transactions. */
const accountIdOf = (ref: string) => (ref.startsWith("plaid:") ? ref.slice(6) : ref);

/**
 * What went into the goal's accounts each of the last few months (money
 * moved in less money taken out, with interest on top), against what the
 * plan needs a month: the habit, month by month.
 */
function MonthByMonth({ goal, today }: { goal: GoalRow; today: string }) {
  const { months, plan } = goal.insight;
  const needed = plan && plan.perMonth > 0 && goal.status !== "complete" ? plan.perMonth : null;
  const rows = months.map((m) => ({ ...m, moved: Math.round((m.added - m.out) * 100) / 100 }));
  const scale = Math.max(needed ?? 0, ...rows.map((m) => Math.abs(m.moved) + m.interest), 1);
  const current = rows.at(-1);
  const thisMonth = today.slice(0, 7);
  const toGo = needed !== null && current && current.month === thisMonth ? Math.round((needed - current.moved) * 100) / 100 : null;

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={`${goal.name}, month by month`}>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Month by month</h3>
        {current && current.month === thisMonth && (
          <p className="text-sm text-muted-foreground">
            {monthName(thisMonth, "long")} so far: {strong(dollars(current.moved))} moved in
            {current.interest >= 0.5 ? <> and {strong(dollars(current.interest))} interest</> : null}.{" "}
            {toGo === null ? null : toGo <= 0.5 ? (
              <span className="inline-flex items-center gap-1 text-moss">
                <Check className="size-3.5" aria-hidden />
                This month&apos;s {dollars(needed!)} is in.
              </span>
            ) : (
              <span className="text-champagne">{dollars(toGo)} more keeps it on plan.</span>
            )}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {/* The bars, drawn to one scale, with the monthly amount needed across them. */}
        <div className="relative h-24">
          {needed !== null && (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-bone/35" style={{ bottom: `${(needed / scale) * 100}%` }} aria-hidden>
              <span className="absolute right-0 bottom-0.5 text-[10px] text-muted-foreground">needed {dollars(needed)}</span>
            </div>
          )}
          <ol className="grid h-full items-end gap-2" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
            {rows.map((m) => {
              const met = needed !== null && m.moved >= needed - 0.5;
              return (
                <li
                  key={m.month}
                  className="mx-auto flex h-full w-full max-w-10 flex-col justify-end"
                  aria-label={`${monthName(m.month, "long")}: ${dollars(m.moved)} moved in${m.interest >= 0.5 ? `, ${dollars(m.interest)} interest` : ""}`}
                >
                  {m.interest >= 0.5 && <div className="w-full rounded-t-sm bg-moss/60" style={{ height: `${(m.interest / scale) * 100}%` }} />}
                  {m.moved !== 0 && (
                    <div
                      className={cn("w-full", m.interest < 0.5 && "rounded-t-sm", m.moved < 0 ? "bg-oxblood/70" : met ? "bg-moss" : "bg-champagne")}
                      style={{ height: `max(2px, ${(Math.abs(m.moved) / scale) * 100}%)` }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="grid gap-2 border-t border-border pt-1" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }} aria-hidden>
          {rows.map((m) => (
            <span key={m.month} className="text-center font-mono text-[10px] text-muted-foreground tabular-nums">
              {m.month === thisMonth ? "now" : monthName(m.month)}
            </span>
          ))}
        </div>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-champagne" aria-hidden />
          Moved in
        </span>
        {needed !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-moss" aria-hidden />
            Met the plan
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-moss/60" aria-hidden />
          Interest
        </span>
      </p>
    </section>
  );
}

/** The latest money in and out of the goal's accounts, each linking to where it happened. */
function RecentActivity({ goal, today }: { goal: GoalRow; today: string }) {
  const { recent } = goal.insight;
  if (recent.length === 0) return null;
  const first = goal.accountRefs.find((ref) => goal.accountLabels[ref]);
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={`${goal.name}, latest activity`}>
      <h3 className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Latest activity</h3>
      <ul className="flex flex-col">
        {recent.map((a, i) => (
          <li key={a.id ?? `${a.date}:${i}`} className="flex items-baseline justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0 first:pt-0">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-bone">{a.interest ? "Interest" : a.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {shortDate(a.date, today)}
                {goal.accountRefs.length > 1 && goal.accountLabels[a.ref] ? ` · ${goal.accountLabels[a.ref]}` : ""}
              </span>
            </span>
            <span className={cn("shrink-0 font-mono tabular-nums", a.amount >= 0 ? "text-moss" : "text-oxblood-text")}>
              {a.amount >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(a.amount), "USD")}
            </span>
          </li>
        ))}
      </ul>
      {first && (
        <Link href={`/transactions?account=${encodeURIComponent(accountIdOf(first))}`} className="inline-flex items-center gap-1 self-start text-xs text-champagne hover:underline">
          All of {goal.accountLabels[first]} in Transactions <ArrowRight className="size-3" aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** A quarter at a time: when each was reached, or when the pace gets there. */
function Milestones({ goal, today }: { goal: GoalRow; today: string }) {
  const { milestones } = goal.insight;
  if (!goal.tracksAccount || goal.status === "complete") return null;
  return (
    <ol className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4" aria-label={`${goal.name} milestones`}>
      {milestones.map((m) => (
        <li key={m.share} className={cn("flex flex-col gap-0.5 border-l pl-2", m.reached ? "border-moss/60" : "border-border")}>
          <span className={cn("inline-flex items-center gap-1 font-medium", m.reached ? "text-moss" : "text-muted-foreground")}>
            {m.reached && <Check className="size-3" aria-hidden />}
            {percent(m.share)} · {dollars(m.amount)}
          </span>
          <span className="text-muted-foreground">
            {m.reached ? (m.date ? `Reached ${shortDate(m.date, today)}` : "Reached") : m.date ? `Around ${roughDate(m.date, today)}` : "Not at this pace"}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---- One goal -------------------------------------------------------------

const TONE_TEXT = { good: "text-moss", bad: "text-oxblood-text", quiet: "text-muted-foreground" } as const;
const TONE_PILL = {
  good: "bg-moss/12 text-moss ring-moss/25",
  bad: "bg-oxblood/12 text-oxblood-text ring-oxblood/30",
  quiet: "bg-bone/6 text-muted-foreground ring-bone/10",
} as const;

const strong = (text: string) => <span className="font-mono text-bone tabular-nums">{text}</span>;

/** "3 months", "2 years": how far off a date is, at the precision a forecast deserves. */
function farOff(fromIso: string, toIso: string): string {
  const months = Math.round(Math.abs(daysBetween(fromIso, toIso)) / 30.44);
  if (months >= 24) return `${Math.round(months / 12)} years`;
  return roughGap(fromIso, toIso);
}

/** Where the goal stands, in one plain sentence; null when the tiles say it all. */
function summaryOf(goal: GoalRow, today: string): React.ReactNode {
  const { insight } = goal;
  const due = goal.targetDate ? shortDate(goal.targetDate, today) : "";
  switch (insight.verdict) {
    case "reached":
      return <>Done{insight.milestones[3].date ? <> on {shortDate(insight.milestones[3].date, today)}</> : null}. Anything past the target is a head start on the next goal.</>;
    case "ahead":
      return (
        <>
          You&apos;re ahead: at this pace it&apos;s done around {roughDate(insight.reachDate!, today)}, {roughGap(insight.reachDate!, goal.targetDate!)} early.
        </>
      );
    case "on-pace":
      return <>You&apos;re on track to finish around {roughDate(insight.reachDate!, today)}.</>;
    case "behind":
      return (
        <>
          At this pace you&apos;d have {strong(dollars(insight.atTargetDate!))} by {due}, {strong(dollars(goal.target - insight.atTargetDate!))} short.
        </>
      );
    case "stalled":
      return insight.pace!.perMonth <= 0 ? (
        <>It&apos;s gone down {strong(dollars(Math.abs(insight.pace!.perMonth)))} a month lately, so it isn&apos;t getting closer.</>
      ) : (
        <>It&apos;s barely growing lately, too slowly to get there.</>
      );
    case "overdue":
      return <>{due} passed with {strong(dollars(goal.remaining))} to go. Pick a new date to get a new plan.</>;
    case "open":
      return <>At this pace it&apos;s done around {roughDate(insight.reachDate!, today)}. Add a date to get a monthly amount.</>;
    case "unknown":
      // By hand there's no pace; the tiles below say what to do, or a date is what's missing.
      return goal.tracksAccount ? (
        <>These accounts need about three weeks of history before there&apos;s a pace to read.</>
      ) : goal.targetDate ? null : (
        <>Add a date to see what to save each month, and use Add money as you set money aside.</>
      );
  }
}

function Tile({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-bone">{label}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className={cn("shrink-0 font-mono text-lg font-semibold tabular-nums", tone ? TONE_TEXT[tone] : "text-bone")}>{value}</span>
    </div>
  );
}

/** The three things to know: what to save a month, this paycheck's share, and where the pace lands. */
function Tiles({ goal, today }: { goal: GoalRow; today: string }) {
  const { plan, nextMove: move, pace, reachDate, interestPerMonth } = goal.insight;
  if (goal.status === "complete") return null;
  const tiles: React.ReactNode[] = [];

  if (plan && goal.targetDate) {
    const interest = interestPerMonth !== null && interestPerMonth >= 0.5 ? interestPerMonth : null;
    tiles.push(
      <Tile
        key="plan"
        label="Save each month"
        value={dollars(plan.perMonth)}
        note={
          plan.perMonth === 0
            ? "Interest alone gets it there"
            : [
                `to finish by ${shortDate(goal.targetDate, today)}`,
                plan.shareOfPay !== null && plan.shareOfPay <= 1 ? `about ${percent(plan.shareOfPay)} of your pay` : null,
                interest ? `plus ~${dollars(interest)} interest` : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
        tone={plan.fits === false ? "bad" : undefined}
      />
    );
  }

  if (move) {
    const done = move.moved !== null && move.moved >= move.suggested - 0.5;
    tiles.push(
      <Tile
        key="check"
        label={`From your ${shortDate(move.paycheck.date, today)} check`}
        value={dollars(move.suggested)}
        tone={done ? "good" : undefined}
        note={
          move.moved === null ? (
            "Log it with Add money once it's moved"
          ) : done ? (
            <span className="inline-flex items-center gap-1 text-moss">
              <Check className="size-3" aria-hidden />
              Moved
            </span>
          ) : move.moved > 0 ? (
            `${dollars(move.moved)} moved, ${dollars(move.suggested - move.moved)} to go`
          ) : (
            "Not moved yet"
          )
        }
      />
    );
  }

  if (pace) {
    const late = reachDate && goal.targetDate && reachDate > goal.targetDate ? farOff(goal.targetDate, reachDate) : null;
    tiles.push(
      <Tile
        key="pace"
        label="At your current pace"
        value={reachDate ? roughDate(reachDate, today) : "Not getting there"}
        tone={late || !reachDate ? "bad" : "good"}
        note={
          <>
            {pace.perMonth >= 0 ? "Adding" : "Losing"} {dollars(Math.abs(pace.perMonth))} a month
            {late ? ` · ${late} late` : ""}
          </>
        }
      />
    );
  }

  if (tiles.length === 0) return null;
  return <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-muted/20">{tiles}</div>;
}

// ---- The list, and one goal's panel ------------------------------------------

function GoalIcon({ goal, className }: { goal: GoalRow; className?: string }) {
  return <GoalBadge name={goal.name} options={goal.options} complete={goal.status === "complete"} className={className} />;
}

/** Progress as a ring in the goal's color, the share saved in the middle. */
function Ring({ goal, size = 64, stroke = 6 }: { goal: GoalRow; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, goal.percent));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bone)" strokeOpacity={0.08} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={accentFor(goal.options, goal.status === "complete")}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <span className={cn("absolute inset-0 flex items-baseline justify-center self-center font-mono font-semibold text-bone tabular-nums", size >= 100 ? "text-lg" : size >= 80 ? "text-base" : "text-xs")}>
        {Math.round(share * 100)}
        <span className="ml-px text-[0.65em] font-normal text-muted-foreground">%</span>
      </span>
    </span>
  );
}

function StatusPill({ goal }: { goal: GoalRow }) {
  // A goal tracked by hand has no pace to judge, so no status.
  if (goal.insight.verdict === "unknown" && !goal.tracksAccount) return null;
  const verdict = VERDICT[goal.insight.verdict];
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONE_PILL[verdict.tone])}>
      {verdict.label}
    </span>
  );
}

/** How long is left, or how it ended, for the foot of a card. */
function timeLeft(goal: GoalRow, today: string): string {
  if (goal.status === "complete") {
    const reached = goal.insight.milestones.at(-1)?.date;
    return reached ? `Reached ${shortDate(reached, today)}` : "Reached";
  }
  if (!goal.targetDate) return "No date";
  if (goal.targetDate < today) return "Past its date";
  const months = monthsUntil(today, goal.targetDate) ?? 0;
  if (months >= 24) return `${Math.floor(months / 12)} years left`;
  return months <= 1 ? `${Math.max(0, daysBetween(today, goal.targetDate))} days left` : `${months} months left`;
}

/**
 * One goal as a card: its mark and name with a menu, its date and how it's
 * going, what's saved against what it's for beside a ring of how far along
 * it is, and what's left and how long there is to go. Opens its panel.
 */
function GoalCard({
  goal,
  today,
  accounts,
  pay,
  onOpen,
}: {
  goal: GoalRow;
  today: string;
  accounts: AccountChoice[];
  pay: PaySummary | null;
  onOpen: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const done = goal.status === "complete";
  const late = !done && goal.targetDate !== null && goal.targetDate < today;
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted";
  return (
    <div className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-bone/20 hover:bg-bone/[0.02]">
      <div className="flex items-center gap-3">
        <GoalIcon goal={goal} className="size-9 rounded-lg" />
        <h3 className="min-w-0 flex-1 truncate text-base font-medium text-bone">
          {/* The whole card opens the goal; the menu stays its own button above it. */}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${goal.name}: ${formatCurrency(goal.saved, "USD")} of ${formatCurrency(goal.target, "USD")}`}
            className="text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-champagne/60"
          >
            {goal.name}
          </button>
        </h3>
        <Popover open={menu} onOpenChange={setMenu}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${goal.name} options`}
              className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-bone data-[state=open]:bg-muted data-[state=open]:text-bone"
            >
              <MoreVertical className="size-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button type="button" className={item} onClick={() => (setMenu(false), onOpen())}>
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
              See details
            </button>
            <button type="button" className={item} onClick={() => (setMenu(false), setDialog("edit"))}>
              <Pencil className="size-3.5 text-muted-foreground" aria-hidden />
              Edit goal
            </button>
            <button type="button" className={cn(item, "text-oxblood-text")} onClick={() => (setMenu(false), setDialog("delete"))}>
              <Trash2 className="size-3.5" aria-hidden />
              Delete
            </button>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1 ring-inset",
            late ? "bg-oxblood/10 text-oxblood-text ring-oxblood/25" : "bg-bone/[0.05] text-muted-foreground ring-bone/10"
          )}
        >
          <Clock className="size-3" aria-hidden />
          {goal.targetDate ? fullDate(goal.targetDate) : "No date"}
        </span>
        <StatusPill goal={goal} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <Money amount={goal.saved} currency="USD" tone="neutral" className="text-[1.6rem] leading-none font-semibold" />
            <span className="text-sm text-muted-foreground">saved</span>
          </p>
          <span className="text-sm text-muted-foreground">from {formatCurrency(goal.target, "USD")}</span>
        </div>
        <Ring goal={goal} size={84} stroke={7} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5 text-xs">
        <span className="text-muted-foreground">
          {done ? (
            <span className="text-moss">All of it saved</span>
          ) : (
            <>
              <span className="font-mono text-sm text-bone tabular-nums">{formatCurrency(goal.remaining, "USD")}</span> remaining
            </>
          )}
        </span>
        <span className={cn("shrink-0", late ? "text-oxblood-text" : "text-muted-foreground")}>{timeLeft(goal, today)}</span>
      </div>

      {dialog === "edit" && <GoalDialog goal={goal} accounts={accounts} pay={pay} today={today} defaultOpen onClosed={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteGoalButton goal={goal} asMenu onDeleted={() => {}} onClosed={() => setDialog(null)} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{children}</h3>;
}

function DeleteGoalButton({
  goal,
  onDeleted,
  asMenu = false,
  onClosed,
}: {
  goal: GoalRow;
  onDeleted: () => void;
  // Opened from a card's menu: no button of its own, open at once, removed once closed.
  asMenu?: boolean;
  onClosed?: () => void;
}) {
  const router = useRouter();
  const [open, setOpenState] = useState(asMenu);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) onClosed?.();
  };
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await send(`/api/goals/${goal.id}`, "DELETE");
      toast.success("Goal removed");
      setOpen(false);
      onDeleted();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete goal");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!asMenu && (
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-oxblood-text hover:text-oxblood-text">
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {goal.name}?</DialogTitle>
          <DialogDescription>The goal goes away. Your accounts and the money in them aren&apos;t touched.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy ? "Deleting…" : "Delete goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Everything about one goal, in the panel that slides in. */
function GoalDetail({
  goal,
  accounts,
  pay,
  today,
  onClose,
}: {
  goal: GoalRow;
  accounts: AccountChoice[];
  pay: PaySummary | null;
  today: string;
  onClose: () => void;
}) {
  const summary = summaryOf(goal, today);
  const monthsLeft = goal.targetDate && goal.targetDate > today ? monthsUntil(today, goal.targetDate) : null;
  const fill = goal.status === "complete" ? "bg-moss" : "bg-champagne";

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <GoalIcon goal={goal} className="size-10" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="truncate">{goal.name}</SheetTitle>
            <SheetDescription>
              {goal.tracksAccount ? goal.accountNames.join(" + ") : "Tracked by hand"}
              {goal.targetDate ? ` · by ${fullDate(goal.targetDate)}` : ""}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!goal.tracksAccount && goal.status !== "complete" && <AddMoneyDialog goal={goal} />}
          <GoalDialog
            goal={goal}
            accounts={accounts}
            pay={pay}
            today={today}
            trigger={
              <Button size="sm" variant="outline">
                <Pencil className="size-3.5" />
                Edit
              </Button>
            }
          />
          <DeleteGoalButton goal={goal} onDeleted={onClose} />
        </div>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-6">
        <section className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Money amount={goal.saved} currency="USD" tone="neutral" className="text-3xl font-semibold" />
              <span className="text-sm text-muted-foreground">of {formatCurrency(goal.target, "USD")}</span>
            </p>
            <StatusPill goal={goal} />
          </div>
          <div
            role="progressbar"
            aria-label={`${goal.name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(goal.percent * 100)}
            className="h-2 w-full overflow-hidden rounded-full bg-bone/8"
          >
            <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.min(1, goal.percent) * 100}%` }} />
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
            <span>
              <span className="text-bone">{percent(Math.min(1, goal.percent))}</span> saved
            </span>
            {goal.status !== "complete" && (
              <span>
                {strong(dollars(goal.remaining))} to go
                {monthsLeft ? ` · ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left` : ""}
              </span>
            )}
          </div>
          {summary && <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{summary}</p>}
        </section>

        {goal.status !== "complete" && (
          <section className="flex flex-col gap-2.5">
            <SectionTitle>What to do</SectionTitle>
            <Tiles goal={goal} today={today} />
          </section>
        )}

        {goal.status !== "complete" && (
          <section className="flex flex-col gap-2.5">
            <SectionTitle>Plan it</SectionTitle>
            <WhatIf goal={goal} today={today} />
          </section>
        )}

        {goal.insight.history && (
          <section className="flex flex-col gap-2.5">
            <SectionTitle>Saved over time</SectionTitle>
            <GoalChart goal={goal} today={today} />
          </section>
        )}

        {goal.tracksAccount && goal.status !== "complete" && (
          <section className="flex flex-col gap-2.5">
            <SectionTitle>Milestones</SectionTitle>
            <Milestones goal={goal} today={today} />
          </section>
        )}

        {goal.insight.months.length > 0 && <MonthByMonth goal={goal} today={today} />}
        <RecentActivity goal={goal} today={today} />
      </SheetBody>
    </>
  );
}

// ---- The goal that needs you most, with a what-if planner --------------------

// The ways the goals can be ordered.
const SORTS = {
  attention: {
    label: "Needs attention",
    // Past its date, then behind, then the soonest date.
    compare: (a: GoalRow, b: GoalRow) => {
      const rank = (g: GoalRow) => {
        const v = g.insight.verdict;
        return v === "overdue" ? 0 : v === "behind" || v === "stalled" ? 1 : g.targetDate ? 2 : 3;
      };
      return rank(a) - rank(b) || (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") || b.percent - a.percent;
    },
  },
  date: { label: "Nearest date", compare: (a: GoalRow, b: GoalRow) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") },
  remaining: { label: "Most to go", compare: (a: GoalRow, b: GoalRow) => b.remaining - a.remaining },
  progress: { label: "Furthest along", compare: (a: GoalRow, b: GoalRow) => b.percent - a.percent },
  name: { label: "Name", compare: (a: GoalRow, b: GoalRow) => a.name.localeCompare(b.name) },
} as const;
type SortKey = keyof typeof SORTS;

const monthShort = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const monthLong = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const up5 = (n: number) => Math.ceil(n / 5) * 5;

/**
 * Drag (or pick) a monthly amount and see the goal fill month by month:
 * each month a track as tall as the target, filled to what would be there
 * by then (what's saved now, what you add, and interest). Your date's month
 * is marked, with what it would still be short, and the month it's reached
 * gets a check.
 */
function WhatIf({ goal, today }: { goal: GoalRow; today: string }) {
  const { plan, pace, interestPerMonth } = goal.insight;
  const interest = interestPerMonth ?? 0;
  const onTime = plan && plan.perMonth > 0 ? up5(plan.perMonth) : null;
  // The pace counts interest; what you've been adding is the rest.
  const yourPace = pace && pace.perMonth - interest > 5 ? Math.round((pace.perMonth - interest) / 5) * 5 : null;
  const suggested = onTime ?? yourPace ?? up5(goal.remaining / 12);
  const max = Math.max(250, Math.ceil((Math.max(suggested, yourPace ?? 0, onTime ?? 0) * 1.6) / 50) * 50);
  const [amount, setAmount] = useState(() => Math.min(max, Math.max(0, yourPace ?? suggested)));
  const [focus, setFocus] = useState<number | null>(null);

  const p = useMemo(
    () => projectGoal({ saved: goal.saved, target: goal.target, perMonth: amount, interestPerMonth: interest, todayIso: today, targetDate: goal.targetDate }),
    [goal.saved, goal.target, amount, interest, today, goal.targetDate]
  );
  const color = accentFor(goal.options);
  const cols = p.columns;
  const active = focus ?? p.dueIndex ?? p.finishIndex ?? cols.length - 1;
  const col = cols[active];
  const dense = cols.length > 14;
  const labelShown = (k: number) => k === 0 || !dense || k % 2 === 0 || k === p.dueIndex || k === p.finishIndex;
  const pct = (v: number) => `${(v / goal.target) * 100}%`;

  const presets = [
    ...(yourPace !== null ? [{ label: "Your pace", value: yourPace }] : []),
    ...(onTime !== null ? [{ label: "On time", value: onTime }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>What if you saved…</SectionTitle>
        <span className="font-mono text-2xl font-semibold text-bone tabular-nums">
          {dollars(amount)}
          <span className="font-sans text-sm font-normal text-muted-foreground"> a month</span>
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <input
          type="range"
          min={0}
          max={max}
          step={5}
          value={amount}
          onChange={(e) => {
            setAmount(Number(e.target.value));
            setFocus(null);
          }}
          aria-label="Monthly amount to try"
          className="w-full cursor-pointer"
          style={{ accentColor: color }}
        />
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Try an amount">
            {presets.map((pr) => (
              <button
                key={pr.label}
                type="button"
                aria-pressed={amount === pr.value}
                onClick={() => {
                  setAmount(Math.min(max, pr.value));
                  setFocus(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors ring-inset",
                  amount === pr.value ? "bg-bone/12 text-bone ring-bone/15" : "text-muted-foreground ring-border hover:bg-bone/6 hover:text-bone"
                )}
              >
                {pr.label}
                <span className="font-mono tabular-nums">{dollars(pr.value)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The month being read: your date's by default, or the one pointed at. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm" aria-live="polite">
        <span className="whitespace-nowrap text-muted-foreground">
          {active === p.dueIndex && goal.targetDate ? (
            <>
              By {fullDate(goal.targetDate)}
              <span className="text-bone"> (your date)</span>
            </>
          ) : col.month === null ? (
            "Today"
          ) : (
            `End of ${monthLong(col.month)}`
          )}
        </span>
        <span className="ml-auto text-right whitespace-nowrap">
          <span className="font-mono text-bone tabular-nums">{dollars(col.total)}</span>
          {col.reached ? (
            <span className="text-moss"> · reached</span>
          ) : (
            <span className={active === p.dueIndex ? "text-oxblood-text" : "text-muted-foreground"}>
              {" "}
              · <span className="font-mono tabular-nums">{dollars(goal.target - col.total)}</span> {active === p.dueIndex ? "short" : "to go"}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-1.5" onMouseLeave={() => setFocus(null)}>
        {/* Marks above the tracks: your date, and the month it's reached. */}
        <div className="flex h-6 items-end gap-[3px] sm:gap-1.5" aria-hidden>
          {cols.map((c, k) => (
            <span key={k} className="flex max-w-7 min-w-0 flex-1 justify-center">
              {k === p.dueIndex ? (
                <span className="relative flex justify-center">
                  <span className="absolute bottom-0 inline-flex items-center gap-1 rounded-full bg-bone/10 px-1.5 py-px text-[10px] whitespace-nowrap text-bone ring-1 ring-bone/15 ring-inset">
                    {k === p.finishIndex && <Check className="size-2.5 text-moss" strokeWidth={3} />}
                    Your date
                  </span>
                </span>
              ) : k === p.finishIndex ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-moss/20 text-moss">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <div className="relative flex h-40 items-stretch gap-[3px] sm:h-44 sm:gap-1.5" role="img" aria-label={`${goal.name}, month by month at ${dollars(amount)} a month`}>
          {cols.map((c, k) => {
            const due = k === p.dueIndex;
            const lit = k === active;
            return (
              <span
                key={k}
                onMouseEnter={() => setFocus(k)}
                onClick={() => setFocus(k)}
                className={cn(
                  "relative max-w-7 min-w-0 flex-1 cursor-default overflow-hidden rounded-[6px] transition-[box-shadow,background-color] duration-200",
                  "bg-bone/[0.06]",
                  due && "ring-1 ring-bone/40 ring-offset-2 ring-offset-card",
                  lit && !due && "ring-1 ring-bone/20 ring-offset-2 ring-offset-card"
                )}
              >
                {/* What your date's month would still be short: hatched, so the gap reads as missing money. */}
                {due && !c.reached && (
                  <span
                    className="absolute inset-x-0 top-0 transition-[bottom] duration-300 ease-out"
                    style={{
                      bottom: pct(c.total),
                      backgroundImage: "repeating-linear-gradient(135deg, color-mix(in oklab, var(--oxblood) 55%, transparent) 0 2px, transparent 2px 6px)",
                      backgroundColor: "color-mix(in oklab, var(--oxblood) 12%, transparent)",
                    }}
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 flex flex-col-reverse transition-[height] duration-300 ease-out" style={{ height: pct(c.total) }}>
                  <span className="w-full" style={{ height: `${(c.saved / Math.max(c.total, 0.01)) * 100}%`, backgroundColor: color, opacity: 0.32 }} />
                  <span className="w-full" style={{ height: `${(c.added / Math.max(c.total, 0.01)) * 100}%`, backgroundColor: color }} />
                  {c.interest > 0 && <span className="w-full bg-moss/70" style={{ height: `${(c.interest / Math.max(c.total, 0.01)) * 100}%` }} />}
                </span>
              </span>
            );
          })}
        </div>
        <div className="flex gap-[3px] sm:gap-1.5" aria-hidden>
          {cols.map((c, k) => (
            <span
              key={k}
              className={cn(
                "max-w-7 min-w-0 flex-1 overflow-visible text-center text-[10px] whitespace-nowrap tabular-nums",
                k === p.dueIndex || k === active ? "text-bone" : "text-muted-foreground"
              )}
            >
              {labelShown(k) ? (c.month === null ? "Now" : monthShort(c.month)) : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: color, opacity: 0.32 }} />
          Saved now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
          You add
        </span>
        {interest >= 0.5 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-moss/70" />
            Interest
          </span>
        )}
        {p.shortAtDue !== null && p.shortAtDue > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-sm"
              style={{ backgroundImage: "repeating-linear-gradient(135deg, color-mix(in oklab, var(--oxblood) 70%, transparent) 0 1.5px, transparent 1.5px 3.5px)" }}
            />
            Short on your date
          </span>
        )}
        <span className="ml-auto">Full track = {dollars(goal.target)}</span>
      </div>

      <p className="rounded-lg border border-border bg-muted/20 px-3.5 py-3 text-sm text-muted-foreground">
        {p.finishMonth === null ? (
          <>At $0 a month{interest > 0.5 ? " and only interest" : ""}, it won&apos;t get there. Slide or pick an amount.</>
        ) : (
          <>
            You&apos;d reach {dollars(goal.target)} in <span className="text-bone">{monthLong(p.finishMonth)}</span>
            {p.monthsLate === null ? (
              "."
            ) : p.monthsLate < 0 ? (
              <span className="text-moss">
                , {-p.monthsLate} month{p.monthsLate === -1 ? "" : "s"} before your date.
              </span>
            ) : p.monthsLate === 0 ? (
              <span className="text-moss">, right on time.</span>
            ) : (
              <>
                <span className="text-oxblood-text">
                  , {p.monthsLate} month{p.monthsLate === 1 ? "" : "s"} after your date.
                </span>
                {p.atDue !== null && goal.targetDate && (
                  <>
                    {" "}
                    By {shortDate(goal.targetDate, today)} you&apos;d have {dollars(p.atDue)}
                    {onTime !== null ? `; ${dollars(onTime)} a month makes it on time.` : "."}
                  </>
                )}
              </>
            )}
            {interest >= 0.5 ? ` That counts about ${dollars(interest)} a month of interest.` : ""}
          </>
        )}
      </p>
    </div>
  );
}

// ---- Ideas for a next goal ----------------------------------------------------

const IDEAS: { name: string; icon: GoalIcon; color: GoalColor; note: string }[] = [
  { name: "Emergency fund", icon: "shield", color: "moss", note: "3 to 6 months of spending" },
  { name: "Vacation", icon: "plane", color: "travel", note: "A trip, paid before you go" },
  { name: "New car", icon: "car", color: "home", note: "A down payment, or all of it" },
  { name: "Home down payment", icon: "house", color: "champagne", note: "Often 10 to 20% of the price" },
  { name: "Holiday gifts", icon: "gift", color: "shopping", note: "No January card bill" },
  { name: "Wedding", icon: "ring", color: "entertainment", note: "The day, without the debt" },
];

function Ideas({ goals, accounts, pay, today }: { goals: GoalRow[]; accounts: AccountChoice[]; pay: PaySummary | null; today: string }) {
  const taken = new Set(goals.map((g) => iconFor(g.name, g.options)));
  const ideas = IDEAS.filter((i) => !taken.has(i.icon)).slice(0, 4);
  if (ideas.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Ideas for a new goal">
      <SectionTitle>Start another goal</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ideas.map((idea) => (
          <GoalDialog
            key={idea.name}
            accounts={accounts}
            pay={pay}
            today={today}
            preset={idea}
            trigger={
              <button
                type="button"
                className="group flex items-center gap-3 rounded-xl border border-dashed border-border p-3.5 text-left transition-colors hover:border-solid hover:border-bone/20 hover:bg-bone/[0.03]"
              >
                <GoalBadge name={idea.name} options={idea} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm text-bone">{idea.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{idea.note}</span>
                </span>
                <Plus className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-champagne" aria-hidden />
              </button>
            }
          />
        ))}
      </div>
    </section>
  );
}

export function GoalsManager({
  goals,
  accounts,
  pay,
  today,
}: {
  goals: GoalRow[];
  accounts: AccountChoice[];
  pay: PaySummary | null;
  today: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"going" | "reached">("going");
  const [sort, setSort] = useState<SortKey>("attention");
  const open = openId ? (goals.find((g) => g.id === openId) ?? null) : null;

  if (goals.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <PiggyBank className="size-8 text-muted-foreground" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">
            Name what you&apos;re saving for, pick the accounts the money sits in, and give it a date. You&apos;ll see how fast
            it&apos;s really growing, when it lands, and how much of each paycheck to move over.
          </p>
          <NewGoalButton accounts={accounts} pay={pay} today={today} />
        </CardContent>
      </Card>
    );
  }

  const going = goals.filter((g) => g.status !== "complete");
  const reached = goals.filter((g) => g.status === "complete");
  // With nothing still going, the reached ones are what there is to show.
  const view = tab === "reached" || going.length === 0 ? "reached" : "going";
  const shown = [...(view === "going" ? going : reached)].sort(SORTS[sort].compare);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="Goals" className="flex gap-6">
          {(
            [
              ["going", "In progress", going.length],
              ["reached", "Reached", reached.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-sm transition-colors",
                view === key ? "border-champagne text-bone" : "border-transparent text-muted-foreground hover:text-bone"
              )}
            >
              {label}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{count}</span>
            </button>
          ))}
        </div>
        <div className="mb-2 flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger size="sm" aria-label="Sort goals" className="min-w-40">
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORTS[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No goals reached yet. They&apos;ll show here once one is.</p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={view === "going" ? "Goals in progress" : "Goals reached"}>
          {shown.map((g) => (
            <GoalCard key={g.id} goal={g} today={today} accounts={accounts} pay={pay} onOpen={() => setOpenId(g.id)} />
          ))}
        </section>
      )}
      {view === "going" && <Ideas goals={goals} accounts={accounts} pay={pay} today={today} />}

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <SheetContent
          className="sm:max-w-xl"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
        >
          {open && <GoalDetail key={open.id} goal={open} accounts={accounts} pay={pay} today={today} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
