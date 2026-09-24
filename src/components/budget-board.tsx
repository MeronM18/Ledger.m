"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, CircleCheck, Eye, EyeOff, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetIncome, BudgetMonth, BudgetProgress, BudgetTip } from "@/lib/budgets";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const whole = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);

async function saveBudget(category: string, amount: number | null, id?: string) {
  const res =
    amount === null
      ? await fetch(`/api/budgets/${id}`, { method: "DELETE" })
      : await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, monthly_amount: amount }),
        });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Couldn't save the budget");
  }
}

// Category, then Budget, Actual and Remaining, the same on every row and header.
const GRID = "grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_5.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_7rem] sm:gap-3";

function ColumnHeads({ title, first = "Budget", last = "Remaining" }: { title: string; first?: string; last?: string }) {
  return (
    <div className={cn(GRID, "border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase sm:px-4")}>
      <span>{title}</span>
      <span className="text-right">{first}</span>
      <span className="text-right">Actual</span>
      <span className="text-right">{last}</span>
    </div>
  );
}

/** What's left, as a pill: green with room, red when over, grey at exactly nothing. */
function Remaining({ amount, income = false }: { amount: number; income?: boolean }) {
  const zero = Math.abs(amount) < 0.005;
  const tone = zero ? "bg-muted text-muted-foreground" : income ? "bg-bone/8 text-bone" : amount > 0 ? "bg-moss/15 text-moss" : "bg-oxblood/15 text-oxblood-text";
  return (
    <span className={cn("ml-auto inline-flex rounded-full px-2 py-0.5 font-mono text-xs tabular-nums sm:text-[13px]", tone)}>
      {amount < 0 && !zero ? "−" : ""}
      {formatCurrency(Math.abs(amount), "USD")}
    </span>
  );
}

/**
 * The line under a row: how much of the budget is used (green, amber near
 * the limit, red over it), with a tick where you'd be if spending evenly
 * through the month.
 */
function UseLine({ used, pace, tone }: { used: number; pace: number | null; tone: "ok" | "warning" | "over" }) {
  const color = tone === "over" ? "bg-oxblood" : tone === "warning" ? "bg-champagne" : "bg-moss";
  return (
    <div className="relative h-[3px] w-full overflow-visible rounded-full bg-muted" aria-hidden>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.min(1, Math.max(0, used)) * 100}%` }} />
      {pace !== null && pace > 0 && pace < 1 && (
        <div className="absolute -top-[3px] h-[9px] w-px bg-bone/60" style={{ left: `${pace * 100}%` }} title="Where an even pace would be today" />
      )}
    </div>
  );
}

/** The budget, editable in place: type a new amount and press Enter (or click away); empty it to remove the budget. */
function BudgetInput({
  category,
  label,
  id,
  value,
  placeholder,
}: {
  category: string;
  label: string;
  id?: string;
  value: number | null;
  placeholder?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = text.trim().replace(/[$,]/g, "");
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      toast.error("Enter an amount above $0, or leave it empty to remove the budget");
      setText(value === null ? "" : String(value));
      return;
    }
    if (next === value || (next === null && !id)) return;
    setSaving(true);
    try {
      await saveBudget(category, next, id);
      toast.success(next === null ? `${label} budget removed` : `${label} budgeted at ${whole(next)}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the budget");
      setText(value === null ? "" : String(value));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">$</span>
      <input
        aria-label={`${label} budget`}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(value === null ? "" : String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 w-full rounded-md border border-border bg-transparent pr-2.5 pl-5 text-right font-mono text-sm tabular-nums transition-colors outline-none placeholder:text-muted-foreground/60 hover:border-bone/25 focus:border-champagne/60 focus:bg-muted/40 disabled:opacity-60"
      />
    </div>
  );
}

function CategoryName({ category, label }: { category: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TransactionAvatar transaction={{ pfc_primary: category, merchant_name: null, name: null, amount: 1 }} className="size-7" />
      <span className="truncate text-sm">{label}</span>
    </span>
  );
}

function BudgetRow({ p, month }: { p: BudgetProgress; month: BudgetMonth }) {
  const router = useRouter();
  async function remove() {
    try {
      await saveBudget(p.category, null, p.id);
      toast.success(`${p.label} budget removed`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the budget");
    }
  }
  return (
    <li className="group/row border-t border-border first:border-t-0">
      <div className={cn(GRID, "px-3 pt-2.5 pb-2 sm:px-4")}>
        <span className="flex min-w-0 items-center gap-1">
          <CategoryName category={p.category} label={p.label} />
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove the ${p.label} budget`}
            className="ml-1 hidden size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-oxblood-text group-hover/row:inline-flex focus-visible:inline-flex"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
        <BudgetInput key={`${p.id}:${p.budget}`} category={p.category} label={p.label} id={p.id} value={p.budget} />
        <span className="text-right font-mono text-sm tabular-nums">{formatCurrency(p.spent, "USD")}</span>
        <Remaining amount={p.remaining} />
      </div>
      <div className="px-3 pb-2.5 sm:px-4">
        <UseLine used={p.percentUsed} pace={month.isCurrent ? month.fraction : null} tone={p.status} />
      </div>
    </li>
  );
}

function UnbudgetedRow({ category, label, amount, suggestion }: { category: string; label: string; amount: number; suggestion: number | null }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <div className={cn(GRID, "px-3 py-2.5 sm:px-4")}>
        <CategoryName category={category} label={label} />
        <BudgetInput category={category} label={label} value={null} placeholder={suggestion ? `${suggestion}` : "Set"} />
        <span className="text-right font-mono text-sm text-muted-foreground tabular-nums">{amount > 0 ? formatCurrency(amount, "USD") : "—"}</span>
        <span className="text-right text-xs text-muted-foreground">No budget</span>
      </div>
    </li>
  );
}

const TIP_ICON = { good: CircleCheck, warn: TrendingUp, bad: CircleAlert } as const;
const TIP_TONE = { good: "text-moss", warn: "text-champagne", bad: "text-oxblood-text" } as const;

function Tips({ tips }: { tips: BudgetTip[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function apply(tip: BudgetTip) {
    if (!tip.action) return;
    setBusy(tip.key);
    try {
      await saveBudget(tip.action.category, tip.action.amount);
      toast.success("Budget saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the budget");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Staying on track</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {tips.map((tip) => {
          const Icon = TIP_ICON[tip.tone];
          return (
            <div key={tip.key} className="flex gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
              <Icon className={cn("mt-0.5 size-4 shrink-0", TIP_TONE[tip.tone])} aria-hidden />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm font-medium text-bone">{tip.title}</p>
                <p className="text-xs text-muted-foreground">{tip.body}</p>
                {tip.action && (
                  <Button size="xs" variant="outline" className="mt-1 self-start" disabled={busy === tip.key} onClick={() => apply(tip)}>
                    {tip.action.label}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * The Budgets page body: income and expenses as Budget / Actual / Remaining
 * rows you edit in place, and beside them what's left to budget, how the
 * month is going and what to do to stay on track.
 */
export function BudgetBoard({
  month,
  income,
  rows,
  unbudgeted,
  others,
  suggestions,
  tips,
}: {
  month: BudgetMonth;
  income: BudgetIncome;
  rows: BudgetProgress[];
  unbudgeted: { category: string; label: string; amount: number }[];
  others: { category: string; label: string }[];
  suggestions: Record<string, number | null>;
  tips: BudgetTip[];
}) {
  const [showAll, setShowAll] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(true);

  const budgeted = rows.reduce((s, p) => s + p.budget, 0);
  const spent = rows.reduce((s, p) => s + p.spent, 0);
  const unbudgetedSpent = unbudgeted.reduce((s, u) => s + u.amount, 0);
  const leftToBudget = income.expected === null ? null : income.expected - budgeted;
  const pace = month.isCurrent ? month.fraction : null;
  const expectedByNow = budgeted * month.fraction;
  const aheadBy = spent - expectedByNow;
  const sorted = [...rows].sort((a, b) => b.budget - a.budget);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="gap-0 overflow-hidden py-0">
          <ColumnHeads title="Income" first="Expected" last="Still expected" />
          <div className={cn(GRID, "px-3 pt-3 pb-2 sm:px-4")}>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-bone">Paychecks</span>
              <span className="truncate text-xs text-muted-foreground">
                {income.expected === null ? "Shows once there's a full month of paychecks" : "Your usual month of pay, from your paycheck history"}
              </span>
            </span>
            <span className="text-right font-mono text-sm text-muted-foreground tabular-nums">
              {income.expected === null ? "—" : formatCurrency(income.expected, "USD")}
            </span>
            <span className="text-right font-mono text-sm tabular-nums">{formatCurrency(income.paychecks, "USD")}</span>
            {income.expected === null ? <span /> : <Remaining amount={income.stillExpected} income />}
          </div>
          <div className="px-3 pb-2.5 sm:px-4">
            {income.expected !== null && <UseLine used={income.paychecks / income.expected} pace={null} tone="ok" />}
          </div>
          <div className={cn(GRID, "border-t border-border px-3 py-2.5 sm:px-4")}>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm text-bone">Extra income</span>
              <span className="truncate text-xs text-muted-foreground">Refunds, transfers in, interest: counted when it lands, never assumed</span>
            </span>
            <span className="text-right font-mono text-sm text-muted-foreground">—</span>
            <span className="text-right font-mono text-sm tabular-nums">{formatCurrency(income.extra, "USD")}</span>
            <span />
          </div>
          <div className={cn(GRID, "border-t border-border bg-muted/40 px-3 py-2.5 sm:px-4")}>
            <span className="text-sm font-semibold text-bone">Total income</span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{income.expected === null ? "—" : formatCurrency(income.expected, "USD")}</span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{formatCurrency(income.paychecks + income.extra, "USD")}</span>
            <span className="text-right text-xs text-muted-foreground">
              {income.expected === null ? "" : income.stillExpected > 0 ? (month.isCurrent ? "Paycheck to come" : "Paycheck missed") : "Paycheck in"}
            </span>
          </div>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <ColumnHeads title="Expenses" />
          <button
            type="button"
            onClick={() => setExpensesOpen((o) => !o)}
            aria-expanded={expensesOpen}
            className={cn(GRID, "px-3 py-3 text-left transition-colors hover:bg-muted/30 sm:px-4")}
          >
            <span className="flex items-center gap-1.5 text-base font-medium text-bone">
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !expensesOpen && "-rotate-90")} />
              Budgeted
            </span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{formatCurrency(budgeted, "USD")}</span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{formatCurrency(spent, "USD")}</span>
            <Remaining amount={budgeted - spent} />
          </button>
          {expensesOpen && (
            <ul className="border-t border-border">
              {sorted.length === 0 ? (
                <li className="px-4 py-6 text-sm text-muted-foreground">No budgets yet. Type an amount beside a category below to start one.</li>
              ) : (
                sorted.map((p) => <BudgetRow key={p.id} p={p} month={month} />)
              )}
            </ul>
          )}

          {(unbudgeted.length > 0 || others.length > 0) && (
            <>
              <div className={cn(GRID, "border-t border-border bg-muted/20 px-3 py-2.5 sm:px-4")}>
                <span className="text-sm font-medium text-muted-foreground">Not budgeted</span>
                <span />
                <span className="text-right font-mono text-sm text-muted-foreground tabular-nums">{formatCurrency(unbudgetedSpent, "USD")}</span>
                <span />
              </div>
              <ul>
                {unbudgeted.map((u) => (
                  <UnbudgetedRow key={u.category} {...u} suggestion={suggestions[u.category] ?? null} />
                ))}
                {showAll && others.map((o) => <UnbudgetedRow key={o.category} {...o} amount={0} suggestion={suggestions[o.category] ?? null} />)}
              </ul>
              {others.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll((s) => !s)}
                  className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-champagne"
                >
                  {showAll ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {showAll ? "Hide categories with no spending" : `Show ${others.length} more categories to budget`}
                </button>
              )}
            </>
          )}

          <div className={cn(GRID, "border-t border-border bg-muted/40 px-3 py-3 sm:px-4")}>
            <span className="text-base font-semibold text-bone">Total expenses</span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{formatCurrency(budgeted, "USD")}</span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{formatCurrency(spent + unbudgetedSpent, "USD")}</span>
            <Remaining amount={budgeted - spent - unbudgetedSpent} />
          </div>
        </Card>
        <p className="px-1 text-xs text-muted-foreground">
          Type in a budget and press Enter to save it; empty it to remove it. Actual spending counts the way Spending does:
          posted charges, net of refunds, your share of anything paid back. The tick on each line is where an even pace
          would put you today.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
        <Card className={cn("text-center", leftToBudget !== null && leftToBudget < 0 ? "border-oxblood/40" : "border-moss/30")}>
          <CardContent className="flex flex-col items-center gap-1 py-2">
            {leftToBudget === null ? (
              <p className="text-sm text-muted-foreground">Left to budget shows once there&apos;s a full month of paychecks on record.</p>
            ) : (
              <>
                <span className={cn("font-mono text-3xl font-semibold tabular-nums", leftToBudget < 0 ? "text-oxblood-text" : "text-moss")}>
                  {leftToBudget < 0 ? "−" : ""}
                  {whole(Math.abs(Math.round(leftToBudget)))}
                </span>
                <span className={cn("text-sm", leftToBudget < 0 ? "text-oxblood-text" : "text-moss")}>
                  {leftToBudget < 0 ? "Budgeted beyond your income" : "Left to budget"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {whole(Math.round(income.expected!))} expected pay − {whole(Math.round(budgeted))} budgeted
                </span>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{month.isCurrent ? "This month so far" : month.label}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {month.isCurrent ? `Day ${month.day} of ${month.days} · ${month.daysLeft} ${month.daysLeft === 1 ? "day" : "days"} left` : "The whole month"}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Spent</span>
              <span className="text-muted-foreground">
                <span className="font-mono font-semibold text-bone tabular-nums">{formatCurrency(spent, "USD")}</span> of{" "}
                <span className="font-mono tabular-nums">{whole(budgeted)}</span>
              </span>
            </div>
            <UseLine used={budgeted > 0 ? spent / budgeted : 0} pace={pace} tone={spent > budgeted ? "over" : budgeted > 0 && spent / budgeted >= 0.8 ? "warning" : "ok"} />
            {budgeted > 0 && (
              <p className="text-xs text-muted-foreground">
                {month.isCurrent ? (
                  Math.abs(aheadBy) < budgeted * 0.02 ? (
                    <>Right on pace.</>
                  ) : aheadBy > 0 ? (
                    <>
                      <span className="text-champagne">{whole(Math.round(aheadBy))} ahead</span> of an even pace for day {month.day}.
                    </>
                  ) : (
                    <>
                      <span className="text-moss">{whole(Math.round(-aheadBy))} under</span> an even pace for day {month.day}.
                    </>
                  )
                ) : spent <= budgeted ? (
                  <>
                    Finished <span className="text-moss">{whole(Math.round(budgeted - spent))} under</span> budget.
                  </>
                ) : (
                  <>
                    Finished <span className="text-oxblood-text">{whole(Math.round(spent - budgeted))} over</span> budget.
                  </>
                )}
                {unbudgetedSpent > 0 && ` Plus ${whole(Math.round(unbudgetedSpent))} in categories with no budget.`}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              {[
                { n: rows.filter((p) => p.status === "ok").length, label: "On track", tone: "text-moss" },
                { n: rows.filter((p) => p.status === "warning").length, label: "Near limit", tone: "text-champagne" },
                { n: rows.filter((p) => p.status === "over").length, label: "Over", tone: "text-oxblood-text" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col">
                  <span className={cn("font-mono text-lg font-semibold tabular-nums", s.n > 0 ? s.tone : "text-muted-foreground")}>{s.n}</span>
                  <span className="text-[11px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {tips.length > 0 && <Tips tips={tips} />}
      </div>
    </div>
  );
}
