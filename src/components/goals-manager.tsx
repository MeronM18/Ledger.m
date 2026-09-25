"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, PiggyBank, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { addDays, daysBetween } from "@/lib/account-history";
import { CHART_RESIZE, chartTooltipProps } from "@/lib/chart-style";
import { dateTicks, formatTickMoney, valueTicks } from "@/lib/day-chart";
import { formatCurrency } from "@/lib/format";
import { dollars, fullDate, roughDate, roughGap, shortDate, VERDICT } from "@/lib/goal-copy";
import type { GoalInsight, PaySummary } from "@/lib/goal-insights";
import { monthsUntil, type GoalProgress } from "@/lib/goals";
import { cn } from "@/lib/utils";

export type GoalRow = GoalProgress & {
  savedManual: number;
  accountRefs: string[];
  // Names of the accounts it follows that have a balance, in the order chosen.
  accountNames: string[];
  // The same names by account ref.
  accountLabels: Record<string, string>;
  insight: GoalInsight;
};
export type AccountChoice = { id: string; label: string; balance: number | null };

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

function GoalDialog({
  goal,
  accounts,
  pay,
  today,
  trigger,
}: {
  goal?: GoalRow;
  accounts: AccountChoice[];
  pay: PaySummary | null;
  today: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [date, setDate] = useState("");
  // Refs ("plaid:<id>" / "manual:<id>") of the accounts this goal follows; empty = tracked by hand.
  const [followed, setFollowed] = useState<string[]>([]);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(goal?.name ?? "");
      setTarget(goal ? String(goal.target) : "");
      setSaved(goal ? String(goal.savedManual) : "");
      setDate(goal?.targetDate ?? "");
      setFollowed(goal?.accountRefs ?? []);
    }
    setOpen(next);
  }

  // What the goal as typed would take, before it's saved.
  const preview = (() => {
    const targetValue = Number(target);
    if (!target || !Number.isFinite(targetValue) || targetValue <= 0) return null;
    const have =
      followed.length > 0
        ? followed.reduce((s, ref) => s + (accounts.find((a) => a.id === ref)?.balance ?? 0), 0)
        : Number(saved) || 0;
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
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        target_amount: targetValue,
        // Only sent when tracking by hand, so linking an account and
        // unlinking later doesn't wipe the amount saved before.
        ...(followed.length === 0 ? { saved_amount: savedValue } : {}),
        target_date: date || null,
        account_refs: followed,
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle>
          <DialogDescription>
            Follow the accounts the money sits in to see its pace and when it lands, or track it by hand.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-name">Name</Label>
            <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input id="goal-target" type="number" min="0" step="1" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-date">Target date (optional)</Label>
              <Input id="goal-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Track progress with</legend>
            {accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No accounts to follow yet. Progress is tracked by hand.</p>
            ) : (
              <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
                {accounts.map((a) => {
                  const checked = followed.includes(a.id);
                  return (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-muted/40">
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
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {followed.length === 0
                ? "Nothing selected: you add money by hand."
                : `Following ${followed.length} account${followed.length === 1 ? "" : "s"}; their balances add up.`}
            </p>
          </fieldset>
          {followed.length === 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-saved">Saved so far</Label>
              <Input id="goal-saved" type="number" min="0" step="1" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" />
            </div>
          )}
          {preview && (
            <p aria-live="polite" className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              {preview}
            </p>
          )}
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
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 px-4 py-3">
      <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-mono text-xl font-semibold tabular-nums", tone ? TONE_TEXT[tone] : "text-bone")}>{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
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
  return <div className={cn("grid gap-3", tiles.length > 1 && "sm:grid-cols-2", tiles.length > 2 && "lg:grid-cols-3")}>{tiles}</div>;
}

function GoalPanel({
  goal,
  accounts,
  pay,
  today,
}: {
  goal: GoalRow;
  accounts: AccountChoice[];
  pay: PaySummary | null;
  today: string;
}) {
  const router = useRouter();
  // A goal tracked by hand has no pace to judge, so no status pill.
  const verdict = goal.insight.verdict === "unknown" && !goal.tracksAccount ? null : VERDICT[goal.insight.verdict];
  const fill = goal.status === "complete" ? "bg-moss" : "bg-champagne";
  const summary = summaryOf(goal, today);
  const monthsLeft = goal.targetDate && goal.targetDate > today ? monthsUntil(today, goal.targetDate) : null;

  async function handleDelete() {
    try {
      await send(`/api/goals/${goal.id}`, "DELETE");
      toast.success("Goal removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete goal");
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium text-bone">{goal.name}</h2>
            <p className="text-xs text-muted-foreground">
              {goal.tracksAccount ? goal.accountNames.join(" + ") : "Tracked by hand"}
              {goal.targetDate ? ` · by ${fullDate(goal.targetDate)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!goal.tracksAccount && goal.status !== "complete" && <AddMoneyDialog goal={goal} />}
            <GoalDialog
              goal={goal}
              accounts={accounts}
              pay={pay}
              today={today}
              trigger={
                <Button size="icon" variant="ghost" aria-label={`Edit ${goal.name}`}>
                  <Pencil className="size-3.5" />
                </Button>
              }
            />
            <Button size="icon" variant="ghost" aria-label={`Delete ${goal.name}`} onClick={handleDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Money amount={goal.saved} currency="USD" tone="neutral" className="text-3xl font-semibold" />
              <span className="text-sm text-muted-foreground">of {formatCurrency(goal.target, "USD")}</span>
            </p>
            {verdict && (
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", TONE_PILL[verdict.tone])}>
                {verdict.label}
              </span>
            )}
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
          <Milestones goal={goal} today={today} />
        </div>

        {summary && <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>}

        <Tiles goal={goal} today={today} />

        {goal.insight.history && <GoalChart goal={goal} today={today} />}

        {goal.insight.months.length > 0 && (
          <div className="grid gap-6 border-t border-border pt-5 lg:grid-cols-2">
            <MonthByMonth goal={goal} today={today} />
            <RecentActivity goal={goal} today={today} />
          </div>
        )}
      </CardContent>
    </Card>
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
  return (
    <div className="flex flex-col gap-4">
      {goals.map((g) => (
        <GoalPanel key={g.id} goal={g} accounts={accounts} pay={pay} today={today} />
      ))}
    </div>
  );
}
