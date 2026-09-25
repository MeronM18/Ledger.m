"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, CircleAlert, CircleCheck, Eye, EyeOff, Gauge, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  categoryBudgetError,
  monthlyBudgetError,
  type Budget,
  type BudgetLine,
  type BudgetMonth,
  type BudgetPlan,
  type BudgetProgress,
  type BudgetStatus,
  type BudgetTip,
} from "@/lib/budgets";
import { formatCurrency } from "@/lib/format";
import type { MerchantTotal } from "@/lib/spending-aggregation";
import { cn } from "@/lib/utils";

const whole = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
const usd = (n: number) => formatCurrency(n, "USD");

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Couldn't save the budget");
  }
}

const saveCategory = (category: string, amount: number | null, id?: string) =>
  amount === null ? send(`/api/budgets/${id}`, "DELETE") : send("/api/budgets", "POST", { category, monthly_amount: amount });
const saveMonthly = (amount: number | null) => send("/api/budgets/monthly", "PUT", { amount });

// Category, then Budget, Spent and Left, the same on every row and header.
// In a narrow table the category takes its own line and the three amounts
// share the one below it.
const GRID = "grid grid-cols-3 items-center gap-x-3 gap-y-1.5 @lg:grid-cols-[minmax(0,1fr)_8rem_7rem_7rem]";
const NAME = "col-span-3 @lg:col-span-1";

const TONE_BAR: Record<BudgetStatus, string> = { ok: "bg-moss", warning: "bg-champagne", over: "bg-oxblood" };

/** What's left, as a pill: green with room, red when over, grey at exactly nothing. */
function Left({ amount }: { amount: number }) {
  const zero = Math.abs(amount) < 0.005;
  const tone = zero ? "bg-muted text-muted-foreground" : amount > 0 ? "bg-moss/15 text-moss" : "bg-oxblood/15 text-oxblood-text";
  return (
    <span className={cn("ml-auto inline-flex rounded-full px-2 py-0.5 font-mono text-xs tabular-nums sm:text-[13px]", tone)}>
      {amount < 0 && !zero ? "−" : ""}
      {usd(Math.abs(amount))}
    </span>
  );
}

/**
 * How much of a budget is used (green, amber near the limit, red over it),
 * with a tick where an even pace through the month would be today.
 */
function UseLine({ used, pace, tone, thick = false }: { used: number; pace: number | null; tone: BudgetStatus; thick?: boolean }) {
  return (
    <div className={cn("relative w-full rounded-full bg-muted", thick ? "h-2" : "h-[3px]")} aria-hidden>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", TONE_BAR[tone])}
        style={{ width: `${Math.min(1, Math.max(0, used)) * 100}%` }}
      />
      {pace !== null && pace > 0 && pace < 1 && (
        <div
          className={cn("absolute w-px bg-bone/70", thick ? "-top-1 h-4" : "-top-[3px] h-[9px]")}
          style={{ left: `${pace * 100}%` }}
          title="Where an even pace would put you today"
        />
      )}
    </div>
  );
}

/**
 * An amount edited in place: type it and press Enter (or click away).
 * Empty removes it when `removable`. `check` says why a value can't be
 * saved, before it's sent.
 */
function AmountInput({
  label,
  value,
  placeholder,
  removable = true,
  check,
  onSave,
  className,
}: {
  label: string;
  value: number | null;
  placeholder?: string;
  removable?: boolean;
  check?: (next: number) => string | null;
  onSave: (next: number | null) => Promise<void>;
  className?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [saving, setSaving] = useState(false);
  const reset = () => setText(value === null ? "" : String(value));

  async function commit() {
    const trimmed = text.trim().replace(/[$,]/g, "");
    const next = trimmed === "" ? null : Number(trimmed);
    if (next === null && !removable) {
      reset();
      return;
    }
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      toast.error(removable ? "Enter an amount above $0, or leave it empty to remove the budget" : "Enter an amount above $0");
      reset();
      return;
    }
    if (next === value || (next === null && value === null)) return;
    const problem = next !== null && check ? check(next) : null;
    if (problem) {
      toast.error(problem);
      reset();
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the budget");
      reset();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">$</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            reset();
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

const transactionsHref = (monthKey: string, category: string) => `/transactions?month=${monthKey}&kind=spending&category=${encodeURIComponent(category)}`;

/** Where a category's money went this month, by merchant, and a way to every transaction behind it. */
function WhereItWent({ merchants, href, label }: { merchants: MerchantTotal[]; href: string; label: string }) {
  return (
    <div className="mx-3 mb-3 flex flex-col gap-2 rounded-lg bg-muted/30 px-3 py-2.5 sm:mx-4">
      {merchants.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing spent here yet this month.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-xs" aria-label={`Where ${label} went`}>
          {merchants.map((m) => (
            <li key={m.merchant} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-bone">
                {m.merchant}
                {m.count > 1 && <span className="text-muted-foreground"> · {m.count} times</span>}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{usd(m.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href={href} className="inline-flex items-center gap-1 self-start text-xs text-champagne hover:underline">
        See every transaction <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}

/** A disclosure on a row's name: open it to see where the money went. */
function Toggle({ open, onToggle, children, label }: { open: boolean; onToggle: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      className="-mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
    >
      {children}
      <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden />
    </button>
  );
}

function BudgetRow({
  p,
  month,
  merchants,
  check,
}: {
  p: BudgetProgress;
  month: BudgetMonth;
  merchants: MerchantTotal[];
  check: (category: string, amount: number) => string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function remove() {
    try {
      await saveCategory(p.category, null, p.id);
      toast.success(`${p.label} budget removed. Its money goes back to Everything else.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the budget");
    }
  }
  return (
    <li className="group/row border-t border-border first:border-t-0">
      <div className={cn(GRID, "px-3 pt-2.5 pb-2 sm:px-4")}>
        <span className={cn(NAME, "flex min-w-0 items-center gap-1")}>
          <Toggle open={open} onToggle={() => setOpen((o) => !o)} label={`${p.label}: where it went`}>
            <CategoryName category={p.category} label={p.label} />
          </Toggle>
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove the ${p.label} budget`}
            className="ml-1 hidden size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-oxblood-text group-hover/row:inline-flex focus-visible:inline-flex"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
        <AmountInput
          key={`${p.id}:${p.budget}`}
          label={`${p.label} budget`}
          value={p.budget}
          check={(next) => check(p.category, next)}
          onSave={async (next) => {
            await saveCategory(p.category, next, p.id);
            toast.success(next === null ? `${p.label} budget removed` : `${p.label} budgeted at ${whole(next)}`);
            router.refresh();
          }}
        />
        <span className="text-right font-mono text-sm tabular-nums">{usd(p.spent)}</span>
        <Left amount={p.remaining} />
      </div>
      <div className="px-3 pb-2.5 sm:px-4">
        <UseLine used={p.percentUsed} pace={month.isCurrent ? month.fraction : null} tone={p.status} />
      </div>
      {open && <WhereItWent merchants={merchants} href={transactionsHref(month.key, p.category)} label={p.label} />}
    </li>
  );
}

/** A category without its own budget: what it's spent, and a place to give it one. */
function UnbudgetedRow({
  category,
  label,
  amount,
  check,
}: {
  category: string;
  label: string;
  amount: number;
  check: (category: string, amount: number) => string | null;
}) {
  const router = useRouter();
  return (
    <li className="border-t border-border">
      <div className={cn(GRID, "px-3 py-2 sm:px-4")}>
        <span className={cn(NAME, "min-w-0 pl-4")}>
          <CategoryName category={category} label={label} />
        </span>
        <AmountInput
          label={`${label} budget`}
          value={null}
          placeholder="Set"
          check={(next) => check(category, next)}
          onSave={async (next) => {
            await saveCategory(category, next);
            toast.success(`${label} budgeted at ${whole(next!)}`);
            router.refresh();
          }}
        />
        <span className="text-right font-mono text-sm text-muted-foreground tabular-nums">{amount !== 0 ? usd(amount) : "—"}</span>
        <span />
      </div>
    </li>
  );
}

/** The monthly budget split into its categories and Everything else, drawn to scale, so it visibly adds up. */
function SplitBar({ rows, plan }: { rows: BudgetProgress[]; plan: BudgetPlan & { total: number } }) {
  const rest = plan.total - plan.assigned;
  const parts = [
    ...[...rows].sort((a, b) => b.budget - a.budget).map((r) => ({ key: r.category, label: r.label, amount: r.budget, color: `var(--viz-${r.colorSlot})` })),
    ...(rest > 0.005 ? [{ key: "rest", label: "Everything else", amount: rest, color: "color-mix(in oklab, var(--bone) 14%, transparent)" }] : []),
  ];
  const scale = Math.max(plan.total, plan.assigned);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${whole(p.amount)}`).join(", ")}>
        {parts.map((p) => (
          <span key={p.key} title={`${p.label}: ${whole(p.amount)}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.amount / scale) * 100}%`, background: p.color }} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {rows.length === 0 ? (
          <>No category budgets yet: all {whole(plan.total)} covers everything you spend.</>
        ) : rest < -0.005 ? (
          <span className="text-oxblood-text">
            Your categories add up to {whole(plan.assigned)}, {whole(-rest)} more than the monthly budget. Lower one so they fit.
          </span>
        ) : (
          <>
            {rows.length} {rows.length === 1 ? "category" : "categories"} <span className="font-mono text-bone tabular-nums">{whole(plan.assigned)}</span>
            {" + "}Everything else <span className="font-mono text-bone tabular-nums">{whole(Math.max(0, rest))}</span>
            {" = "}
            <span className="font-mono text-bone tabular-nums">{whole(plan.total)}</span> a month
          </>
        )}
      </p>
    </div>
  );
}

/** Ahead of or behind an even pace for the day, or how the month finished. */
function PaceNote({ line, month }: { line: BudgetLine; month: BudgetMonth }) {
  if (!month.isCurrent) {
    return line.remaining >= 0 ? (
      <>
        Finished <span className="text-moss">{whole(Math.round(line.remaining))} under</span> budget.
      </>
    ) : (
      <>
        Finished <span className="text-oxblood-text">{whole(Math.round(-line.remaining))} over</span> budget.
      </>
    );
  }
  const ahead = line.spent - line.budget * month.fraction;
  if (Math.abs(ahead) < line.budget * 0.02) return <>Right on an even pace for day {month.day}.</>;
  return ahead > 0 ? (
    <>
      <span className="text-champagne">{whole(Math.round(ahead))} ahead</span> of an even pace for day {month.day}.
    </>
  ) : (
    <>
      <span className="text-moss">{whole(Math.round(-ahead))} under</span> an even pace for day {month.day}.
    </>
  );
}

/** The monthly budget: what's left of it, the month's pace, and how it's split. */
function MonthlyBudget({ plan, rows, month, budgets }: { plan: BudgetPlan; rows: BudgetProgress[]; month: BudgetMonth; budgets: Budget[] }) {
  const router = useRouter();
  const save = async (next: number | null) => {
    await saveMonthly(next);
    toast.success(next === null ? "Monthly budget removed" : `Monthly budget set to ${whole(next)}`);
    router.refresh();
  };
  const check = (next: number) => monthlyBudgetError(next, budgets);

  if (plan.total === null || plan.month === null) {
    return (
      <Card className="border-champagne/30">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-lg flex-col gap-1.5">
            <h2 className="flex items-center gap-2 text-base font-medium text-bone">
              <Gauge className="size-4 text-champagne" aria-hidden />
              Set a monthly budget
            </h2>
            <p className="text-sm text-muted-foreground">
              One number for everything you mean to spend in a month. Category budgets split it, and whatever you
              don&apos;t give a category covers everything else.
              {plan.assigned > 0 && <> Your category budgets add up to {whole(plan.assigned)}, so it has to be at least that.</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AmountInput label="Monthly budget" value={null} placeholder={plan.assigned > 0 ? String(Math.ceil(plan.assigned)) : "Amount"} removable={false} check={check} onSave={save} className="w-36" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const m = plan.month;
  const tone = m.status;
  const days = `${month.daysLeft} ${month.daysLeft === 1 ? "day" : "days"}`;
  // Every line in the table, Everything else included.
  const lines = [...rows.map((p) => p.status), ...(plan.everythingElse ? [plan.everythingElse.status] : [])];
  const counts = [
    { n: lines.filter((st) => st === "ok").length, label: "on track", tone: "text-moss" },
    { n: lines.filter((st) => st === "warning").length, label: "near limit", tone: "text-champagne" },
    { n: lines.filter((st) => st === "over").length, label: "over", tone: "text-oxblood-text" },
  ].filter((c) => c.n > 0);

  return (
    <Card className={cn(tone === "over" ? "border-oxblood/40" : tone === "warning" ? "border-champagne/30" : "border-moss/25")}>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {m.remaining < 0 ? `Over budget in ${month.label.split(" ")[0]}` : month.isCurrent ? `Left to spend in ${month.label.split(" ")[0]}` : `Left in ${month.label}`}
            </span>
            <span className={cn("font-mono text-4xl font-semibold tabular-nums", m.remaining < 0 ? "text-oxblood-text" : "text-bone")}>
              {m.remaining < 0 ? "−" : ""}
              {usd(Math.abs(m.remaining))}
            </span>
            <span className="text-sm text-muted-foreground">
              {m.remaining < 0
                ? `over your ${whole(plan.total)} budget`
                : month.isCurrent && month.daysLeft > 0
                  ? `about ${usd(Math.floor((m.remaining / month.daysLeft) * 100) / 100)} a day for the last ${days}`
                  : `left of ${whole(plan.total)}`}
            </span>
          </div>
          <label className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Monthly budget</span>
            <AmountInput key={plan.total} label="Monthly budget" value={plan.total} removable={false} check={check} onSave={save} className="w-32" />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <UseLine used={m.percentUsed} pace={month.isCurrent ? month.fraction : null} tone={tone} thick />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-mono text-bone tabular-nums">{usd(m.spent)}</span> spent of {whole(plan.total)}
              {/* Once over, the pace has nothing left to say. */}
              {(m.remaining >= 0 || !month.isCurrent) && (
                <>
                  {" · "}
                  <PaceNote line={m} month={month} />
                </>
              )}
            </span>
            {counts.length > 0 && (
              <span>
                {counts.map((c, i) => (
                  <span key={c.label}>
                    {i > 0 && " · "}
                    <span className={cn("font-mono tabular-nums", c.tone)}>{c.n}</span> {c.label}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <SplitBar rows={rows} plan={{ ...plan, total: plan.total }} />
        </div>
      </CardContent>
    </Card>
  );
}

const TIP_ICON = { good: CircleCheck, warn: Gauge, bad: CircleAlert } as const;
const TIP_TONE = { good: "text-moss", warn: "text-champagne", bad: "text-oxblood-text" } as const;

function Tips({ tips }: { tips: BudgetTip[] }) {
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
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * The Budgets page body: the monthly budget and what's left of it, the
 * category budgets that split it (each editable in place, each opening to
 * where its money went), Everything else for the rest, and beside them what
 * to watch to stay within budget.
 */
export function BudgetBoard({
  month,
  rows,
  plan,
  budgets,
  merchants,
  others,
  tips,
}: {
  month: BudgetMonth;
  rows: BudgetProgress[];
  plan: BudgetPlan;
  budgets: Budget[];
  merchants: Record<string, MerchantTotal[]>;
  others: { category: string; label: string }[];
  tips: BudgetTip[];
}) {
  const [showAll, setShowAll] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const check = (category: string, amount: number) => categoryBudgetError(plan.total, budgets, category, amount);
  const sorted = [...rows].sort((a, b) => b.budget - a.budget);
  const pace = month.isCurrent ? month.fraction : null;
  const budgetedSpent = rows.reduce((s, p) => s + p.spent, 0);
  const rest = plan.everythingElse;
  // Everything else's merchants: all the categories without a budget, together.
  const restMerchants = plan.unbudgeted
    .flatMap((c) => merchants[c.category] ?? [])
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const unbudgetedList = (
    <ul>
      {plan.unbudgeted.map((u) => (
        <UnbudgetedRow key={u.category} category={u.category} label={u.label} amount={u.amount} check={check} />
      ))}
      {showAll && others.map((o) => <UnbudgetedRow key={o.category} {...o} amount={0} check={check} />)}
      {others.length > 0 && (
        <li className="border-t border-border">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="flex w-full items-center gap-2 px-4 py-2.5 pl-11 text-xs text-muted-foreground transition-colors hover:text-champagne"
          >
            {showAll ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showAll ? "Hide categories with no spending" : `Show ${others.length} more categories to budget`}
          </button>
        </li>
      )}
    </ul>
  );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <MonthlyBudget plan={plan} rows={rows} month={month} budgets={budgets} />

        <Card className="@container gap-0 overflow-hidden py-0">
          <div className={cn(GRID, "border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase sm:px-4")}>
            <span className="hidden @lg:block">Category</span>
            <span className="text-right">Budget</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Left</span>
          </div>

          <ul>
            {sorted.length === 0 ? (
              <li className="px-4 py-6 text-sm text-muted-foreground">
                No category budgets yet. Give a category its own budget below to keep a closer eye on it.
              </li>
            ) : (
              sorted.map((p) => <BudgetRow key={p.id} p={p} month={month} merchants={merchants[p.category] ?? []} check={check} />)
            )}
          </ul>

          {rest ? (
            <div className="border-t border-border">
              <div className={cn(GRID, "px-3 pt-2.5 pb-2 sm:px-4")}>
                <span className={cn(NAME, "min-w-0")}>
                  <Toggle open={restOpen} onToggle={() => setRestOpen((o) => !o)} label="Everything else: the categories in it">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-bone/25 text-[11px] text-muted-foreground" aria-hidden>
                        {plan.unbudgeted.length}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">Everything else</span>
                        <span className="truncate text-[11px] text-muted-foreground">Categories without their own budget</span>
                      </span>
                    </span>
                  </Toggle>
                </span>
                <span className="text-right font-mono text-sm text-muted-foreground tabular-nums" title="The monthly budget less the category budgets">
                  {usd(Math.max(0, rest.budget))}
                </span>
                <span className="text-right font-mono text-sm tabular-nums">{usd(rest.spent)}</span>
                <Left amount={rest.remaining} />
              </div>
              <div className="px-3 pb-2.5 sm:px-4">
                <UseLine used={rest.percentUsed} pace={pace} tone={rest.status} />
              </div>
              {restOpen && (
                <>
                  {restMerchants.length > 0 && (
                    <WhereItWent merchants={restMerchants} href={`/transactions?month=${month.key}&kind=spending`} label="Everything else" />
                  )}
                  {unbudgetedList}
                </>
              )}
            </div>
          ) : (
            (plan.unbudgeted.length > 0 || others.length > 0) && (
              <div className="border-t border-border">
                <div className={cn(GRID, "bg-muted/20 px-3 py-2.5 sm:px-4")}>
                  <span className={cn(NAME, "text-sm font-medium text-muted-foreground")}>Not budgeted</span>
                  <span />
                  <span className="text-right font-mono text-sm text-muted-foreground tabular-nums">{usd(plan.unbudgetedSpent)}</span>
                  <span />
                </div>
                {unbudgetedList}
              </div>
            )
          )}

          <div className={cn(GRID, "border-t border-border bg-muted/40 px-3 py-3 sm:px-4")}>
            <span className={cn(NAME, "text-base font-semibold text-bone")}>{plan.total !== null ? "Monthly budget" : "Budgeted"}</span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{usd(plan.total ?? plan.assigned)}</span>
            <span className="text-right font-mono text-sm font-semibold tabular-nums">{usd(plan.total !== null ? plan.spent : budgetedSpent)}</span>
            <Left amount={plan.month ? plan.month.remaining : plan.assigned - budgetedSpent} />
          </div>
        </Card>
        <p className="px-1 text-xs text-muted-foreground">
          Type a budget and press Enter to save it; empty a category&apos;s to remove it. Category budgets have to fit
          inside the monthly budget. Spent is counted the way Spending counts it: posted charges less refunds, and only your
          share of anything paid back. The tick on each line is where an even pace would put you today. Open a category to
          see where its money went.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6">{tips.length > 0 && <Tips tips={tips} />}</div>
    </div>
  );
}
