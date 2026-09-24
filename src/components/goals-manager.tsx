"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check, PiggyBank, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Area, ComposedChart, CartesianGrid, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { dollars, fullDate, paceWindow, roughDate, roughGap, shortDate, VERDICT } from "@/lib/goal-copy";
import type { GoalInsight, PaySummary } from "@/lib/goal-insights";
import { monthsUntil, type GoalProgress } from "@/lib/goals";
import { cn } from "@/lib/utils";

export type GoalRow = GoalProgress & {
  savedManual: number;
  accountRefs: string[];
  // Names of the accounts it follows that have a balance, in the order chosen.
  accountNames: string[];
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
const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

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
 * The amount saved day by day, then two roads from today: where the pace of
 * the last few months leads (dotted), and the straight path that reaches
 * the target on its date (dashed). The gap between them is the story.
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
      if (insight.pace) now.pace = now.saved;
      if (dated) now.need = now.saved;
      points.push({
        t: tOf(end),
        pace: insight.pace ? (now.saved ?? 0) + (insight.pace.perMonth * days) / (365.25 / 12) : undefined,
        need: dated ? goal.target : undefined,
      });
    }

    const highest = Math.max(goal.target, ...points.flatMap((p) => [p.saved ?? 0, p.pace ?? 0]));
    const yTicks = valueTicks(0, highest, 4);
    const x = dateTicks(points[0].t, points[points.length - 1].t, 6);
    const last = points[points.length - 1];
    return { points, yTicks, xTicks: x.ticks, xLabel: x.label, future: end !== null && goal.status !== "complete", paceEnd: last.pace !== undefined ? last : null };
  }, [insight, goal.targetDate, goal.status, goal.target, today]);

  const yStep = model.yTicks.length > 1 ? model.yTicks[1] - model.yTicks[0] : 1;
  const label = `${goal.name}: saved over time${model.future ? ", your pace ahead, and the path that reaches the target on time" : ""}.`;

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div role="group" aria-label={label}>
        <ResponsiveContainer {...CHART_RESIZE} width="100%" height={220}>
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
                  ["Needed", p.t > tOf(today) ? p.need : undefined],
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
            {/* Where the pace leaves it: the number the dotted line lands on. */}
            {model.paceEnd && (
              <ReferenceDot
                x={model.paceEnd.t}
                y={model.paceEnd.pace}
                r={3}
                fill="var(--champagne)"
                stroke="var(--card)"
                strokeWidth={1.5}
                label={{ value: formatTickMoney(model.paceEnd.pace!, 100), position: "left", fill: "var(--champagne)", fontSize: 11, offset: 8 }}
              />
            )}
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
          {insight.pace && (
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
              Needed to finish on time
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

// ---- One goal -------------------------------------------------------------

/**
 * Progress as a bar marked in quarters, each quarter dated: when it was
 * reached, or when the pace gets there.
 */
function MilestoneRail({ goal, today }: { goal: GoalRow; today: string }) {
  const fill = goal.status === "complete" ? "bg-moss" : goal.status === "behind" ? "bg-oxblood" : "bg-champagne";
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label={`${goal.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(goal.percent * 100)}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${goal.percent * 100}%` }} />
        {[25, 50, 75].map((p) => (
          <span key={p} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-card" style={{ left: `${p}%` }} aria-hidden />
        ))}
      </div>
      <ol className="grid grid-cols-4 text-[11px] leading-snug" aria-label="Milestones">
        {goal.insight.milestones.map((m) => {
          const when = m.reached ? (m.date ? shortDate(m.date, today) : "Reached") : m.date ? `around ${roughDate(m.date, today)}` : null;
          return (
            <li key={m.share} className="flex flex-col items-end text-right">
              <span className={cn("inline-flex items-center gap-1 font-medium", m.reached ? "text-moss" : "text-muted-foreground")}>
                {m.reached && <Check className="size-3" aria-hidden />}
                {Math.round(m.share * 100)}%
                <span className="sr-only">{m.reached ? " reached" : ""}</span>
              </span>
              <span className="text-muted-foreground">{when ?? " "}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const TONE_TEXT = { good: "text-moss", bad: "text-oxblood-text", quiet: "text-muted-foreground" } as const;
const TONE_DOT = { good: "bg-moss", bad: "bg-oxblood", quiet: "bg-muted-foreground" } as const;

const strong = (text: string) => <span className="font-mono text-foreground tabular-nums">{text}</span>;
const when = (text: string) => <span className="text-foreground">{text}</span>;

/** What the pace says, in a sentence or two. */
function Reading({ goal, today }: { goal: GoalRow; today: string }) {
  const { insight } = goal;
  const window = insight.pace ? paceWindow(insight.pace.since, today) : "";
  const rate = insight.pace ? `${insight.pace.perMonth >= 0 ? "+" : "-"}${dollars(Math.abs(insight.pace.perMonth))}` : "";
  const due = goal.targetDate ? fullDate(goal.targetDate) : "";
  switch (insight.verdict) {
    case "reached":
      return <>Done{insight.milestones[3].date ? <> on {shortDate(insight.milestones[3].date, today)}</> : null}. Anything past {dollars(goal.target)} is a head start on the next one.</>;
    case "ahead":
    case "on-pace":
      return (
        <>
          Growing {strong(rate)} a month over {window}, it reaches {dollars(goal.target)} around {when(roughDate(insight.reachDate!, today))}
          {insight.verdict === "ahead" ? <>, {roughGap(insight.reachDate!, goal.targetDate!)} before {due}.</> : <>, just in time for {due}.</>}
        </>
      );
    case "behind":
      return (
        <>
          Growing {strong(rate)} a month over {window}, it would be at {strong(dollars(insight.atTargetDate!))} on {due},{" "}
          {strong(dollars(goal.target - insight.atTargetDate!))} short. At that pace it gets there around {when(roughDate(insight.reachDate!, today))}.
        </>
      );
    case "stalled":
      return insight.pace!.perMonth <= 0 ? (
        <>
          Down {strong(dollars(Math.abs(insight.pace!.perMonth)))} a month over {window}. At this rate it doesn&apos;t get there.
        </>
      ) : (
        <>Growing only {strong(rate)} a month over {window}, too slowly to get there.</>
      );
    case "overdue":
      return <>{due} passed with {strong(dollars(goal.remaining))} to go. Pick a new date to get a new plan.</>;
    case "open":
      return (
        <>
          Growing {strong(rate)} a month over {window}, it reaches {dollars(goal.target)} around {when(roughDate(insight.reachDate!, today))}. Add a date
          to get a plan.
        </>
      );
    case "unknown":
      return goal.tracksAccount ? (
        <>There isn&apos;t three weeks of history in these accounts yet, so there&apos;s no pace to read.</>
      ) : (
        <>
          Tracked by hand, so there&apos;s no history to read a pace from. Follow the accounts the money sits in to see one
          {goal.targetDate ? "." : ", and add a date to see what it takes each month."}
        </>
      );
  }
}

function Plan({ goal, pay, today }: { goal: GoalRow; pay: PaySummary | null; today: string }) {
  const { plan, interestPerMonth, apy } = goal.insight;
  if (!plan || !goal.targetDate) return null;
  const interest = interestPerMonth !== null && interestPerMonth >= 0.5 ? interestPerMonth : null;
  return (
    <section aria-label="The plan" className="flex flex-col gap-2.5">
      <h3 className="text-sm font-medium">To finish by {shortDate(goal.targetDate, today)}</h3>
      {plan.perMonth === 0 ? (
        <p className="text-sm text-muted-foreground">Interest alone gets it there. Anything you add is extra.</p>
      ) : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Each month</dt>
          <dd>
            {strong(dollars(plan.perMonth))}{" "}
            <span className="text-muted-foreground">
              for {plan.months} month{plan.months === 1 ? "" : "s"}
              {interest ? ", on top of interest" : ""}
            </span>
          </dd>
          {plan.shareOfPay !== null && (
            <>
              <dt className="text-muted-foreground">Of your pay</dt>
              <dd>
                {strong(percent(plan.shareOfPay))}{" "}
                <span className="text-muted-foreground">
                  {plan.shareOfPay > 1
                    ? "of a typical month, more than one brings in"
                    : plan.leanMonth
                      ? `of every check; ${dollars(plan.leanMonth.amount)} in a lean month like ${monthName(plan.leanMonth.month)}`
                      : "of every check"}
                </span>
              </dd>
            </>
          )}
          {interest && (
            <>
              <dt className="text-muted-foreground">Interest</dt>
              <dd>
                {strong(`+${dollars(interest)}`)} <span className="text-muted-foreground">a month at {apy!.toFixed(2)}% APY</span>
              </dd>
            </>
          )}
        </dl>
      )}
      {plan.fits !== null && pay?.savingsRate != null && plan.perMonth > 0 && (
        <p className={cn("text-xs", plan.fits ? "text-muted-foreground" : "text-oxblood-text")}>
          {plan.fits
            ? `That fits: over the past year you've kept ${percent(pay.savingsRate)} of what came in.`
            : pay.savingsRate > 0
              ? `That's more than the ${percent(pay.savingsRate)} of what came in that you've kept over the past year.`
              : "Over the past year spending has matched what came in, so this needs room made for it."}
        </p>
      )}
    </section>
  );
}

/** The latest paycheck, its share for this goal, and whether that's been moved over. */
function NextMove({ goal, today }: { goal: GoalRow; today: string }) {
  const move = goal.insight.nextMove;
  if (!move) return null;
  const done = move.moved !== null && move.moved >= move.suggested - 0.5;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted/50 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <p>
          Paid {shortDate(move.paycheck.date, today)}: {strong(dollars(move.paycheck.amount))}
        </p>
        <p className="text-muted-foreground">
          Its share for this goal is {strong(dollars(move.suggested))}.
        </p>
      </div>
      {move.moved === null && <p className="text-sm text-muted-foreground">Log it with Add money once it&apos;s moved.</p>}
      {move.moved !== null && (
        <p className={cn("inline-flex items-center gap-1.5 text-sm", done ? "text-moss" : "text-muted-foreground")}>
          {done ? (
            <>
              <Check className="size-4" aria-hidden />
              {dollars(move.moved)} moved since
            </>
          ) : move.moved > 0 ? (
            <>
              {dollars(move.moved)} moved, {dollars(move.suggested - move.moved)} to go
            </>
          ) : (
            "Not moved yet"
          )}
        </p>
      )}
    </div>
  );
}

/** Where the pace came from: money moved in, interest, money taken out. */
function Flows({ goal, today }: { goal: GoalRow; today: string }) {
  const f = goal.insight.flows;
  if (!f || (f.added === 0 && f.interest === 0 && f.out === 0)) return null;
  return (
    <section aria-label="Where it came from" className="flex flex-col gap-1.5">
      <h3 className="text-xs text-muted-foreground">Over {paceWindow(f.since, today)}</h3>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Moved in</dt>
          <dd className="font-mono text-moss tabular-nums">+{dollars(f.added)}</dd>
          <span className="text-muted-foreground">
            moved in{f.deposits > 0 ? ` over ${f.deposits} deposit${f.deposits === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        {f.interest > 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Interest</dt>
            <dd className="font-mono text-moss tabular-nums">+{dollars(f.interest)}</dd>
            <span className="text-muted-foreground">interest</span>
          </div>
        )}
        {f.out > 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Taken out</dt>
            <dd className="font-mono text-oxblood-text tabular-nums">-{dollars(f.out)}</dd>
            <span className="text-muted-foreground">taken out</span>
          </div>
        )}
      </dl>
    </section>
  );
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
  const verdict =
    goal.insight.verdict === "unknown" && !goal.tracksAccount ? { label: "Tracked by hand", tone: "quiet" as const } : VERDICT[goal.insight.verdict];

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
            <h2 className="text-base font-medium">{goal.name}</h2>
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

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Money amount={goal.saved} currency="USD" tone="neutral" className="text-3xl font-semibold" />
            <span className="text-sm text-muted-foreground">of {formatCurrency(goal.target, "USD")}</span>
          </p>
          <p className={cn("inline-flex items-center gap-2 text-sm font-medium", TONE_TEXT[verdict.tone])}>
            <span className={cn("size-2 rounded-full", TONE_DOT[verdict.tone])} aria-hidden />
            {verdict.label}
          </p>
        </div>

        <MilestoneRail goal={goal} today={today} />

        <div className={cn("grid gap-x-8 gap-y-6", goal.insight.history && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]")}>
          <div className="flex min-w-0 flex-col gap-5">
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              <Reading goal={goal} today={today} />
            </p>
            <Plan goal={goal} pay={pay} today={today} />
            <NextMove goal={goal} today={today} />
            <Flows goal={goal} today={today} />
          </div>
          {goal.insight.history && <GoalChart goal={goal} today={today} />}
        </div>
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
