import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { BudgetSuggestion } from "@/components/overview/budget-suggestion";
import { CARD_GRIP, ChangeChip, PillStrip, type TileChange } from "@/components/overview/stat-tile";
import { GoalBadge, accentFor } from "@/components/goal-look";
import { QueryErrorState } from "@/components/query-error";
import { DragHandle } from "@/components/sortable-card-list";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { formatCurrency } from "@/lib/format";
import { loadForecast } from "@/lib/forecast-data";
import { verdictLine } from "@/lib/goal-copy";
import { loadGoals } from "@/lib/goals-data";
import { upcomingBills, type CategoryShare } from "@/lib/overview";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LedgerTransaction } from "@/lib/spending-data";
import { humanizeTransaction, prettyName } from "@/lib/transaction-display";
import type { Described, TransactionKind } from "@/lib/transaction-kind";
import { cn } from "@/lib/utils";

const usd = (n: number) => formatCurrency(n, "USD");
const whole = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// The account as the rest of the app names it ("Sapphire Preferred ••4657").
const accountName = (a: { name: string; mask: string | null }) => `${prettyName(a.name)}${a.mask ? ` ••${a.mask}` : ""}`;

/**
 * A card's frame on the Overview: its title and a link to the page with
 * more, then its body. When it's the last card in a column and stretches to
 * end level with the column beside it, `center` settles the body in the
 * middle of the extra height instead of leaving it empty at the foot.
 */
function Panel({ title, href, linkLabel, children, center = false }: { title: string; href: string; linkLabel: string; children: React.ReactNode; center?: boolean }) {
  return (
    <section aria-label={title} className="relative flex h-full flex-col gap-4 rounded-xl border border-border bg-card px-5 pt-4 pb-5">
      <DragHandle className={CARD_GRIP} />
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-sm text-muted-foreground">{title}</h2>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne">
          {linkLabel} <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
      <div className={cn("flex flex-1 flex-col gap-4", center && "justify-center")}>{children}</div>
    </section>
  );
}

const Figure = ({ children }: { children: React.ReactNode }) => (
  <span className="font-serif text-[1.5rem] leading-none font-medium tracking-[-0.01em] text-bone">{children}</span>
);

export function PanelSkeleton() {
  return <div className="h-full min-h-56 animate-pulse rounded-xl border border-border bg-card" />;
}

const UPCOMING_DAYS = 14;
const UPCOMING_SHOWN = 5;

/**
 * Bills, subscriptions and card payments due in the next two weeks. Async,
 * for <Suspense>: the forecast it reads loads on its own, so the rest of the
 * page doesn't wait on it.
 */
export async function UpcomingCard({ todayIso }: { todayIso: string }) {
  const data = await loadForecast(createAdminClient());
  const upcoming = data.error ? null : upcomingBills(data.forecast.events, todayIso, UPCOMING_DAYS);
  return (
    <Panel title="Upcoming" href="/recurring" linkLabel="Recurring">
      {upcoming === null ? (
        <QueryErrorState message="Couldn't load what's coming up." />
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Figure>{usd(upcoming.total)}</Figure>
            <span className="text-sm text-muted-foreground">due in the next {UPCOMING_DAYS} days</span>
          </p>
          {upcoming.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is due in the next two weeks.</p>
          ) : (
            <ul className="flex flex-col">
              {upcoming.items.slice(0, UPCOMING_SHOWN).map((e, i) => (
                <li key={`${e.date}:${e.name}:${i}`} className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0 first:pt-0">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {/* The same marks as the transactions below: a card payment as money moving, a bill by its name. */}
                    <TransactionAvatar
                      transaction={{
                        name: e.name,
                        merchant_name: e.name,
                        pfc_primary: e.kind === "card" ? "LOAN_PAYMENTS" : null,
                        pfc_detailed: e.kind === "card" ? "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" : null,
                        amount: 1,
                      }}
                      className="size-7"
                    />
                    <span className="flex min-w-0 flex-col">
                      {/* A card payment names the card, with "Card payment" on the line beneath, so the name fits whole. */}
                      <span className="truncate text-bone" title={e.name}>
                        {e.kind === "card" ? e.name.replace(/\s+payment$/i, "") : e.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {e.kind === "card" ? "Card payment · " : ""}
                        {dayLabel(e.date)}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">{usd(Math.abs(e.amount))}</span>
                </li>
              ))}
              {upcoming.items.length > UPCOMING_SHOWN && (
                <li className="border-t border-border pt-2 text-xs text-muted-foreground">and {upcoming.items.length - UPCOMING_SHOWN} more</li>
              )}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

const RING = 2 * Math.PI * 42;

/** The month's spending as a ring: each top category its share, the rest in grey, the total in the middle. */
function Donut({ parts, total, label }: { parts: { key: string; share: number; color: string }[]; total: number; label: string }) {
  // Where each slice starts around the ring: the shares before it, added up.
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((s, p) => s + p.share, 0) * RING);
  return (
    <div className="relative mx-auto size-36 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={label}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bone)" strokeOpacity={0.06} strokeWidth="9" />
        {parts.map((p, i) => (
          <circle
            key={p.key}
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={p.color}
            strokeWidth="9"
            // A hair of space between slices.
            strokeDasharray={`${Math.max(0, p.share * RING - (parts.length > 1 ? 1.6 : 0))} ${RING}`}
            strokeDashoffset={-starts[i]}
          />
        ))}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-xl leading-none font-medium text-bone">{whole(total)}</span>
        <span className="mt-1 text-[11px] text-muted-foreground">spent</span>
      </span>
    </div>
  );
}

/** This month's biggest categories as a ring and a legend, in the colors Spending uses. */
export function WhereItWentCard({
  monthName,
  top,
  rest,
  error,
}: {
  monthName: string;
  top: CategoryShare[];
  rest: { count: number; amount: number };
  error: boolean;
}) {
  const total = top.reduce((s, c) => s + c.amount, 0) + rest.amount;
  const parts = [
    ...top.map((c) => ({ key: c.category, share: total > 0 ? c.amount / total : 0, color: `var(--viz-${c.colorSlot})` })),
    ...(rest.amount > 0 ? [{ key: "rest", share: rest.amount / total, color: "var(--ash-grey)" }] : []),
  ];
  return (
    <Panel title="Where it went" href="/reports/spending" linkLabel="Spending" center>
      {error ? (
        <QueryErrorState message="Couldn't load spending." />
      ) : top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No spending in {monthName} yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Donut parts={parts} total={total} label={`${monthName} spending by category: ${top.map((c) => `${c.label} ${Math.round(c.share * 100)}%`).join(", ")}`} />
          <ul className="flex flex-col gap-2 text-sm">
            {top.map((c) => (
              <li key={c.category} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--viz-${c.colorSlot})` }} aria-hidden />
                  <span className="truncate text-bone">{c.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {usd(c.amount)}
                  <span className="ml-2 inline-block w-8 text-right text-xs text-muted-foreground">{Math.round(c.share * 100)}%</span>
                </span>
              </li>
            ))}
            {rest.count > 0 && (
              <li className="flex items-center justify-between gap-3 text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full bg-ash-grey" aria-hidden />
                  {rest.count} more {rest.count === 1 ? "category" : "categories"}
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {usd(rest.amount)}
                  <span className="ml-2 inline-block w-8 text-right text-xs">{total > 0 ? Math.round((rest.amount / total) * 100) : 0}%</span>
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export type BudgetWatch = { category: string; label: string; spent: number; budget: number; percentUsed: number; status: "ok" | "warning" | "over" };

const BUDGET_PILLS = 30;
const STATUS_COLOR = { ok: "var(--moss)", warning: "var(--champagne)", over: "var(--oxblood)" } as const;
const STATUS_TEXT = { ok: "text-moss", warning: "text-champagne", over: "text-oxblood-text" } as const;

/**
 * The month against the monthly budget, the Overview's lead: what's left,
 * a strip of pills lit for what's left (all red once it's over), the
 * categories closest to their own budgets, and the limit itself.
 */
export function BudgetCard({
  monthName,
  total,
  remaining,
  percentUsed,
  status,
  daysLeft,
  watch,
  spent,
  suggestion = null,
}: {
  monthName: string;
  // Null when no monthly budget is set.
  total: number | null;
  remaining: number;
  percentUsed: number;
  status: "ok" | "warning" | "over";
  daysLeft: number;
  watch: BudgetWatch[];
  spent: number;
  // A budget that fits recent months, when the one set is far below them.
  suggestion?: { average: number; suggested: number } | null;
}) {
  if (total === null) {
    return (
      <Panel title="Left to spend" href="/budgets" linkLabel="Budgets">
        <span className="font-serif text-[2rem] leading-none font-medium text-bone">No budget yet</span>
        <p className="text-sm text-muted-foreground">Set one on Budgets to see what&apos;s left to spend each day of {monthName}.</p>
        <PillStrip levels={new Array(BUDGET_PILLS).fill(null)} color={STATUS_COLOR.ok} />
        <Link href="/budgets" className="inline-flex items-center gap-1 self-start text-sm text-champagne hover:underline">
          Set a monthly budget <ArrowRight className="size-3" aria-hidden />
        </Link>
      </Panel>
    );
  }
  const left = Math.max(0, 1 - percentUsed);
  const chip: TileChange =
    status === "over"
      ? { text: "Over", direction: null, tone: "bad", label: "Over budget" }
      : { text: `${Math.round(left * 100)}% left`, direction: null, tone: "quiet", label: `${Math.round(left * 100)}% of the budget left` };
  const [dollars, cents] = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(remaining)).split(".");
  return (
    <Panel title="Left to spend" href="/budgets" linkLabel="Budgets">
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn("font-serif text-[2.5rem] leading-none font-medium tracking-[-0.01em]", remaining < 0 ? "text-oxblood-text" : "text-bone")}>
            {remaining < 0 ? "−" : ""}
            {dollars}
            <span className="text-[0.55em] opacity-60">.{cents}</span>
          </span>
          <ChangeChip change={chip} />
        </p>
        <p className="text-sm text-muted-foreground">
          {remaining < 0
            ? `over your ${whole(total)} budget for ${monthName}`
            : daysLeft > 0
              ? `about ${whole(remaining / daysLeft)} a day for the last ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
              : `left of ${whole(total)} in ${monthName}`}
        </p>
      </div>
      {status === "over" ? (
        // Over budget, how far over: the budget as a share of the bar, the rest past it in red.
        <div className="flex flex-col gap-1.5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-bone/[0.06]" aria-hidden>
            <span className="h-full bg-champagne/70" style={{ width: `${(total / Math.max(spent, total)) * 100}%` }} />
            <span className="h-full bg-oxblood" style={{ width: `${(1 - total / Math.max(spent, total)) * 100}%` }} />
          </div>
          <p className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              <span className="font-mono text-bone tabular-nums">{usd(spent)}</span> spent
            </span>
            <span>{Math.round((spent / total) * 100)}% of the budget</span>
          </p>
        </div>
      ) : (
        // Lit for what's left, so the bright part is the figure.
        <PillStrip levels={Array.from({ length: BUDGET_PILLS }, (_, i) => (i < Math.round(left * BUDGET_PILLS) ? 1 : null))} color={STATUS_COLOR[status]} />
      )}
      {watch.length > 0 && (
        <ul className="flex flex-col gap-2.5" aria-label="Budgets to watch">
          {watch.map((w) => (
            <li key={w.category} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-bone">{w.label}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  <span className={STATUS_TEXT[w.status]}>{usd(w.spent)}</span>
                  <span className="text-muted-foreground"> of {whole(w.budget)}</span>
                </span>
              </span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-bone/[0.06]" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${Math.min(1, w.percentUsed) * 100}%`, background: STATUS_COLOR[w.status] }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {suggestion && <BudgetSuggestion average={suggestion.average} suggested={suggestion.suggested} current={total} />}
      <div className="mt-auto flex items-center justify-between gap-3 rounded-lg bg-bone/[0.04] px-3 py-2 text-sm">
        <span className="text-muted-foreground">Monthly budget</span>
        <span className="font-mono text-bone tabular-nums">{usd(total)}</span>
      </div>
    </Panel>
  );
}

// Money moving between your own accounts is greyed, as on Transactions: it isn't spending or income.
const KIND: Record<TransactionKind, { label: string; className: string }> = {
  spending: { label: "Spending", className: "bg-bone/[0.07] text-bone/80 ring-bone/10" },
  refund: { label: "Refund", className: "bg-moss/12 text-moss ring-moss/25" },
  income: { label: "Income", className: "bg-moss/12 text-moss ring-moss/25" },
  "card-payment": { label: "Card payment", className: "bg-bone/[0.04] text-muted-foreground ring-bone/10" },
  transfer: { label: "Transfer", className: "bg-bone/[0.04] text-muted-foreground ring-bone/10" },
  "loan-payment": { label: "Loan payment", className: "bg-bone/[0.04] text-muted-foreground ring-bone/10" },
};

const MOVING = new Set<TransactionKind>(["card-payment", "transfer", "loan-payment"]);

/** The latest transactions, each labeled with what it is, the account and the day. */
export function RecentTransactionsCard({ rows, described, error }: { rows: LedgerTransaction[]; described: Map<string, Described>; error: boolean }) {
  return (
    <Panel title="Recent transactions" href="/transactions" linkLabel="All transactions">
      {error ? (
        <QueryErrorState message="Couldn't load recent transactions." />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        // Columns come and go with the card's own width: account only when there's room, type and date next.
        <div className="@container -mx-5">
          <table className="w-full table-fixed text-sm @[34rem]:table-auto">
            <thead>
              <tr className="border-y border-border bg-muted/30 text-left text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                <th scope="col" className="py-2 pr-3 pl-5 font-medium">
                  Transaction
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium @[34rem]:table-cell">
                  Type
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium @[46rem]:table-cell">
                  Account
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium @[34rem]:table-cell">
                  Date
                </th>
                <th scope="col" className="w-28 py-2 pr-5 pl-3 text-right font-medium @[34rem]:w-auto">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const d = described.get(t.id);
                const kind = d ? KIND[d.kind] : null;
                const incoming = t.amount < 0;
                const moving = d ? MOVING.has(d.kind) && !d.counts : false;
                return (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pr-3 pl-5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <TransactionAvatar transaction={t} className="size-7 shrink-0" />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-bone">{humanizeTransaction(t).displayName}</span>
                            {t.pending && <span className="shrink-0 text-[11px] text-champagne">Pending</span>}
                          </span>
                          {/* On a phone, what the hidden columns say, in one line. */}
                          <span className="truncate text-xs text-muted-foreground @[34rem]:hidden">
                            {kind ? `${kind.label} · ` : ""}
                            {dayLabel(t.date)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 @[34rem]:table-cell">
                      {kind && <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ring-1 ring-inset", kind.className)}>{kind.label}</span>}
                    </td>
                    <td className="hidden max-w-48 truncate px-3 py-2.5 text-muted-foreground @[46rem]:table-cell">{t.account ? accountName(t.account) : "Cash"}</td>
                    <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground @[34rem]:table-cell">{dayLabel(t.date)}</td>
                    <td className={cn("py-2.5 pr-5 pl-3 text-right font-mono whitespace-nowrap tabular-nums", moving ? "text-muted-foreground" : incoming ? "text-moss" : "text-bone")}>
                      {incoming ? "+" : ""}
                      {usd(Math.abs(t.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * Banks that stopped syncing and Apple statements that are due, as one
 * quiet line under the greeting: the numbers below go stale until they're
 * done, but they're chores, not the headline.
 */
export function AccountNotices({ items }: { items: { key: string; text: string; href: string; action: string }[] }) {
  if (items.length === 0) return null;
  return (
    // Each notice wraps as one unit: its mark, its words and its action together.
    <ul className="-mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground" role="status" aria-label="Needs your attention">
      {items.map((n) => (
        <li key={n.key} className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-champagne" aria-hidden />
          <span>
            {n.text}{" "}
            <Link href={n.href} className="whitespace-nowrap text-champagne underline-offset-4 hover:underline">
              {n.action}
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What's safe to spend over the next two weeks (income isn't predicted: it's
 * commission, so it only counts once it lands): the cash in checking, less
 * the bills due before then and what the cards are owed, with the sum laid
 * out so the figure can be checked. Async, for <Suspense>, like Upcoming.
 */
export async function SafeToSpendCard({ todayIso }: { todayIso: string }) {
  const data = await loadForecast(createAdminClient());
  return (
    <Panel title="Safe to spend" href="/accounts" linkLabel="Accounts">
      {data.error ? (
        <QueryErrorState message="Couldn't work out what's safe to spend." />
      ) : !data.hasCashAccount ? (
        <p className="text-sm text-muted-foreground">Connect a checking account to see what&apos;s safe to spend.</p>
      ) : (
        (() => {
          const f = data.forecast;
          const until = f.nextIncome ? `until your ${dayLabel(f.nextIncome.date)} paycheck` : `over the next ${f.daysToPayday} days`;
          const [dollars, cents] = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(f.safeToSpend)).split(".");
          const rows = [
            { label: "In checking", amount: f.cash, sign: "" },
            { label: `Bills before ${dayLabel(f.nextIncome?.date ?? shiftIso(todayIso, f.daysToPayday))}`, amount: -f.billsBeforePayday, sign: "−" },
            { label: "Owed on cards", amount: -f.cardBalances, sign: "−" },
          ];
          return (
            <>
              <div className="flex flex-col gap-1.5">
                <span className={cn("font-serif text-[2.5rem] leading-none font-medium tracking-[-0.01em]", f.safeToSpend < 0 ? "text-oxblood-text" : "text-bone")}>
                  {f.safeToSpend < 0 ? "−" : ""}
                  {dollars}
                  <span className="text-[0.55em] opacity-60">.{cents}</span>
                </span>
                <p className="text-sm text-muted-foreground">
                  {f.safeToSpend < 0
                    ? `short ${until}, once the bills and cards are paid`
                    : `${until}${f.perDay !== null ? `, about ${whole(f.perDay)} a day` : ""}`}
                </p>
              </div>
              <ul className="flex flex-col gap-1.5 rounded-lg bg-bone/[0.04] px-3 py-2.5 text-sm" aria-label="How it's worked out">
                {rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3">
                    <span className="truncate text-muted-foreground">{r.label}</span>
                    <span className={cn("shrink-0 font-mono tabular-nums", r.amount < 0 ? "text-muted-foreground" : "text-bone")}>
                      {r.amount < 0 ? "−" : ""}
                      {usd(Math.abs(r.amount))}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t border-border pt-1.5">
                  <span className="text-bone">Safe to spend</span>
                  <span className={cn("font-mono tabular-nums", f.safeToSpend < 0 ? "text-oxblood-text" : "text-moss")}>
                    {f.safeToSpend < 0 ? "−" : ""}
                    {usd(Math.abs(f.safeToSpend))}
                  </span>
                </li>
              </ul>
              {f.firstBelowThreshold && (
                <p className="flex gap-2 text-xs text-champagne">
                  <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  At your usual spending, checking dips under {whole(data.lowBalanceThreshold)} around {dayLabel(f.firstBelowThreshold.date)}.
                </p>
              )}
            </>
          );
        })()
      )}
    </Panel>
  );
}

function shiftIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const GOALS_SHOWN = 3;

/**
 * The savings goals that most need you, each with its mark, how far along it
 * is and where its pace leaves it. Async, for <Suspense>.
 */
export async function GoalsCard({ todayIso }: { todayIso: string }) {
  const data = await loadGoals(createAdminClient());
  // Unfinished goals first, those furthest behind their date first; then finished ones.
  const rank = (g: (typeof data.rows)[number]) => (g.status === "complete" ? 2 : g.insight.verdict === "behind" || g.insight.verdict === "stalled" || g.insight.verdict === "overdue" ? 0 : 1);
  const goals = [...data.rows].sort((a, b) => rank(a) - rank(b) || a.percent - b.percent).slice(0, GOALS_SHOWN);
  const saved = data.rows.reduce((s, g) => s + g.saved, 0);
  const target = data.rows.reduce((s, g) => s + g.target, 0);
  return (
    <Panel title="Goals" href="/goals" linkLabel={data.rows.length > GOALS_SHOWN ? `All ${data.rows.length} goals` : "Goals"}>
      {data.error ? (
        <QueryErrorState message="Couldn't load your goals." />
      ) : goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No goals yet.{" "}
          <Link href="/goals" className="text-champagne hover:underline">
            Start one
          </Link>{" "}
          for an emergency fund, a trip or anything you&apos;re saving toward.
        </p>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Figure>{whole(saved)}</Figure>
            <span className="text-sm text-muted-foreground">saved of {whole(target)} across {data.rows.length === 1 ? "your goal" : `${data.rows.length} goals`}</span>
          </p>
          <ul className="grid gap-3 md:grid-cols-3">
            {goals.map((g) => {
              const color = accentFor(g.options, g.status === "complete");
              const line = verdictLine(g.insight, todayIso);
              return (
                <li key={g.id}>
                  <Link href="/goals" className="flex h-full flex-col gap-2.5 rounded-lg border border-border px-3.5 py-3 transition-colors hover:border-bone/20 hover:bg-bone/[0.02]">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <GoalBadge name={g.name} options={g.options} complete={g.status === "complete"} className="size-8" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-bone">{g.name}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground tabular-nums">
                          {whole(g.saved)} of {whole(g.target)}
                        </span>
                      </span>
                    </span>
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-bone/[0.06]" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, g.percent * 100)}%`, background: color }} />
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{line ?? (g.targetDate ? `By ${dayLabel(g.targetDate)}` : "No date set")}</span>
                      <span className="shrink-0 font-mono tabular-nums" style={{ color }}>
                        {Math.round(g.percent * 100)}%
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
