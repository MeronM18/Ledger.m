"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
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
}: {
  goal?: GoalRow;
  accounts: AccountChoice[];
  pay: PaySummary | null;
  today: string;
  trigger: React.ReactNode;
  // A starting point for a new goal (from the ideas), filled in when it opens.
  preset?: { name: string; icon: GoalIcon; color: GoalColor };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<TrackMode>("balance");
  const [icon, setIcon] = useState<GoalIcon | null>(null);
  const [color, setColor] = useState<GoalColor | null>(null);
  // Refs ("plaid:<id>" / "manual:<id>" / "asset:<id>") of what this goal follows.
  const [followed, setFollowed] = useState<string[]>([]);
  // Percent of each followed account that counts; missing is all of it.
  const [shares, setShares] = useState<Record<string, string>>({});

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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
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
                <div className="flex max-h-60 flex-col gap-3 overflow-y-auto rounded-lg border border-border p-2">
                  {groups.map((g) => (
                    <div key={g.title} className="flex flex-col gap-0.5">
                      <span className="px-1.5 pb-1 text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{g.title}</span>
                      {g.items.map((a) => {
                        const checked = followed.includes(a.id);
                        return (
                          <div key={a.id} className={cn("flex items-center gap-2 rounded px-1.5 py-1.5 text-sm", checked ? "bg-bone/[0.04]" : "hover:bg-muted/40")}>
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setFollowed((f) => (checked ? f.filter((x) => x !== a.id) : [...f, a.id]))}
                                className="size-4 accent-[var(--champagne)]"
                              />
                              <span className="min-w-0 flex-1 truncate">{a.label}</span>
                              {a.balance !== null && (
                                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatCurrency(a.balance, "USD")}</span>
                              )}
                            </label>
                            {checked && (
                              <span className="relative flex shrink-0 items-center">
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  aria-label={`Share of ${a.label} that counts`}
                                  value={shares[a.id] ?? "100"}
                                  onChange={(e) => setShares((s) => ({ ...s, [a.id]: e.target.value }))}
                                  className="h-7 w-16 pr-5 text-right font-mono text-xs tabular-nums"
                                />
                                <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">%</span>
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
        <Button size="sm" variant="outline">
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
      <span className={cn("absolute inset-0 flex items-center justify-center font-mono font-semibold text-bone tabular-nums", size >= 100 ? "text-lg" : "text-xs")}>
        {percent(share)}
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

/** The one thing to do next for a goal, in a few words. */
function nextStep(goal: GoalRow, today: string): { text: string; tone: "good" | "bad" | "quiet" | "act" } {
  const { plan, nextMove: move, verdict, reachDate } = goal.insight;
  if (goal.status === "complete") return { text: "Reached. Nice work.", tone: "good" };
  if (verdict === "overdue") return { text: "Its date has passed. Pick a new one.", tone: "bad" };
  if (move) {
    const toGo = move.moved === null ? move.suggested : move.suggested - move.moved;
    if (toGo > 0.5) {
      return { text: `Move ${dollars(toGo)}${move.moved ? " more" : ""} from your ${shortDate(move.paycheck.date, today)} paycheck`, tone: "act" };
    }
    if (move.moved !== null) return { text: `This paycheck's ${dollars(move.suggested)} is in`, tone: "good" };
  }
  if (plan && goal.targetDate) {
    if (plan.perMonth === 0) return { text: "Interest alone gets it there", tone: "good" };
    return { text: `Save ${dollars(plan.perMonth)} a month to finish on time`, tone: "act" };
  }
  if (verdict === "open" && reachDate) return { text: `On pace to finish around ${roughDate(reachDate, today)}`, tone: "quiet" };
  if (!goal.targetDate) return { text: "Add a date to get a monthly plan", tone: "quiet" };
  return { text: "A pace shows after a few weeks of history", tone: "quiet" };
}

const STEP_TONE = { good: "text-moss", bad: "text-oxblood-text", quiet: "text-muted-foreground", act: "text-champagne" } as const;

/** One goal in the list: where it stands and what to do next. Opens its panel. */
function GoalCard({ goal, today, onOpen }: { goal: GoalRow; today: string; onOpen: () => void }) {
  const step = nextStep(goal, today);
  const monthsLeft = goal.targetDate && goal.targetDate > today ? monthsUntil(today, goal.targetDate) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${goal.name}: ${formatCurrency(goal.saved, "USD")} of ${formatCurrency(goal.target, "USD")}`}
      className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-bone/20 hover:bg-bone/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex items-start gap-3">
        <GoalIcon goal={goal} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-bone">{goal.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {goal.targetDate ? `By ${shortDate(goal.targetDate, today)}` : "No date"}
            {monthsLeft ? ` · ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left` : ""}
          </span>
        </span>
        <StatusPill goal={goal} />
      </span>
      <span className="flex items-center gap-4">
        <Ring goal={goal} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <Money amount={goal.saved} currency="USD" tone="neutral" className="text-xl font-semibold" />
          <span className="text-xs text-muted-foreground">
            of {dollars(goal.target)}
            {goal.status !== "complete" ? ` · ${dollars(goal.remaining)} to go` : ""}
          </span>
        </span>
      </span>
      <span className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
        <span className={cn("min-w-0", STEP_TONE[step.tone])}>{step.text}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{children}</h3>;
}

function DeleteGoalButton({ goal, onDeleted }: { goal: GoalRow; onDeleted: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-oxblood-text hover:text-oxblood-text">
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </DialogTrigger>
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

/** The goal most worth attention: past its date, then behind, then the soonest date; reached goals never. */
function featuredGoal(goals: GoalRow[]): GoalRow | null {
  const rank = (g: GoalRow) => {
    const v = g.insight.verdict;
    return v === "overdue" ? 0 : v === "behind" || v === "stalled" ? 1 : g.targetDate ? 2 : 3;
  };
  const open = goals.filter((g) => g.status !== "complete");
  return open.sort((a, b) => rank(a) - rank(b) || (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") || b.percent - a.percent)[0] ?? null;
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Drag to try a monthly amount: when it would finish, against the goal's
 * date, drawn as the road from today to the target next to what's saved so far.
 */
function WhatIf({ goal, today }: { goal: GoalRow; today: string }) {
  const { plan, pace, interestPerMonth, history } = goal.insight;
  const interest = interestPerMonth ?? 0;
  const suggested = plan?.perMonth ?? (pace && pace.perMonth > 0 ? pace.perMonth : goal.remaining / 12);
  const max = Math.max(250, Math.ceil((Math.max(suggested, pace?.perMonth ?? 0) * 2) / 50) * 50);
  const [amount, setAmount] = useState(() => Math.min(max, Math.max(25, Math.round(suggested / 25) * 25)));

  const perMonth = amount + interest;
  const months = perMonth > 0 ? Math.ceil(goal.remaining / perMonth) : null;
  const finish = months !== null ? addMonthsIso(today, months) : null;
  const diff = finish && goal.targetDate ? Math.round(daysBetween(goal.targetDate, finish) / 30.44) : null;
  const color = accentFor(goal.options);

  // The picture: saved so far (last six months), then the road at this amount.
  const W = 320;
  const H = 110;
  const past = history ? history.values.slice(-180).filter((_, i, all) => i % 7 === 0 || i === all.length - 1) : [goal.saved];
  const futureMonths = Math.min(months ?? 24, 60);
  const totalSteps = past.length - 1 + futureMonths;
  const top = goal.target * 1.08;
  const x = (i: number) => (totalSteps > 0 ? (i / totalSteps) * W : 0);
  const y = (v: number) => H - (Math.max(0, v) / top) * H;
  const pastPath = past.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const nowX = x(past.length - 1);
  const endV = Math.min(goal.target, goal.saved + perMonth * futureMonths);
  const endX = x(past.length - 1 + (months !== null && goal.saved + perMonth * futureMonths >= goal.target ? Math.min(months, futureMonths) : futureMonths));
  const dueX = goal.targetDate && monthsUntil(today, goal.targetDate) !== null ? x(past.length - 1 + Math.min(monthsUntil(today, goal.targetDate)!, futureMonths)) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>What if you saved…</SectionTitle>
        <span className="font-mono text-2xl font-semibold text-bone tabular-nums">
          {dollars(amount)}
          <span className="font-sans text-sm font-normal text-muted-foreground"> a month</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={25}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        aria-label="Monthly amount to try"
        className="w-full cursor-pointer"
        style={{ accentColor: color }}
      />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full overflow-visible" aria-hidden>
        <line x1={0} x2={W} y1={y(goal.target)} y2={y(goal.target)} stroke="var(--bone)" strokeOpacity={0.3} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        {dueX !== null && <line x1={dueX} x2={dueX} y1={0} y2={H} stroke="var(--bone)" strokeOpacity={0.2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <path d={`${pastPath} L${nowX},${H} L0,${H} Z`} fill={color} fillOpacity={0.1} />
        <path d={pastPath} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path
          d={`M${nowX},${y(goal.saved)} L${endX},${y(endV)}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="5 5"
          vectorEffect="non-scaling-stroke"
          className="transition-all duration-300"
        />
      </svg>
      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Saved so far</span>
        {goal.targetDate && <span>┊ your date, {shortDate(goal.targetDate, today)}</span>}
        <span>Target {dollars(goal.target)}</span>
      </div>
      <p className="rounded-lg border border-border bg-muted/20 px-3.5 py-3 text-sm text-muted-foreground">
        {finish === null ? (
          <>At $0 a month{interest > 0.5 ? " and only interest" : ""}, it won&apos;t get there. Slide to try an amount.</>
        ) : (
          <>
            You&apos;d reach {dollars(goal.target)} around <span className="text-bone">{roughDate(finish, today)}</span>
            {diff === null ? (
              "."
            ) : diff < 0 ? (
              <span className="text-moss">, {-diff} month{diff === -1 ? "" : "s"} before your date.</span>
            ) : diff === 0 ? (
              <span className="text-moss">, right on time.</span>
            ) : (
              <span className="text-oxblood-text">, {diff} month{diff === 1 ? "" : "s"} after your date.</span>
            )}
            {interest >= 0.5 ? ` That counts about ${dollars(interest)} a month of interest.` : ""}
          </>
        )}
      </p>
    </div>
  );
}

function FeaturedGoal({ goal, today, onOpen }: { goal: GoalRow; today: string; onOpen: () => void }) {
  const step = nextStep(goal, today);
  const monthsLeft = goal.targetDate && goal.targetDate > today ? monthsUntil(today, goal.targetDate) : null;
  return (
    <Card className="relative overflow-hidden">
      {/* A soft wash of the goal's color behind it. */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-[0.07] blur-3xl"
        style={{ backgroundColor: accentFor(goal.options) }}
        aria-hidden
      />
      <CardContent className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <GoalIcon goal={goal} className="size-11" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Needs you most</span>
              <h2 className="truncate text-lg font-medium text-bone">{goal.name}</h2>
              <span className="text-xs text-muted-foreground">
                {goal.targetDate ? `By ${fullDate(goal.targetDate)}` : "No date"}
                {monthsLeft ? ` · ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left` : ""}
              </span>
            </div>
            <StatusPill goal={goal} />
          </div>
          <div className="flex items-center gap-5">
            <Ring goal={goal} size={112} stroke={9} />
            <div className="flex min-w-0 flex-col gap-1">
              <Money amount={goal.saved} currency="USD" tone="neutral" className="text-3xl font-semibold" />
              <span className="text-sm text-muted-foreground">of {formatCurrency(goal.target, "USD")}</span>
              <span className="text-sm text-muted-foreground">{strong(dollars(goal.remaining))} to go</span>
            </div>
          </div>
          <div className={cn("flex items-center gap-3 rounded-lg border px-3.5 py-3 text-sm", step.tone === "act" ? "border-champagne/30 bg-champagne/[0.06]" : "border-border bg-muted/20")}>
            <ArrowRight className={cn("size-4 shrink-0", STEP_TONE[step.tone])} aria-hidden />
            <span className={cn("min-w-0 flex-1", STEP_TONE[step.tone])}>{step.text}</span>
          </div>
          <Button variant="outline" size="sm" className="self-start" onClick={onOpen} aria-label={`Open ${goal.name}`}>
            See everything about it
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <WhatIf key={goal.id} goal={goal} today={today} />
      </CardContent>
    </Card>
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

  const featured = featuredGoal(goals);
  // The rest: ones still in progress first, the reached ones after.
  const rest = goals.filter((g) => g !== featured).sort((a, b) => Number(a.status === "complete") - Number(b.status === "complete"));

  return (
    <>
      {featured && <FeaturedGoal goal={featured} today={today} onOpen={() => setOpenId(featured.id)} />}
      {rest.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Your goals">
          {featured && <SectionTitle>{rest.length === 1 ? "Your other goal" : "Your other goals"}</SectionTitle>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rest.map((g) => (
              <GoalCard key={g.id} goal={g} today={today} onOpen={() => setOpenId(g.id)} />
            ))}
          </div>
        </section>
      )}
      <Ideas goals={goals} accounts={accounts} pay={pay} today={today} />

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
