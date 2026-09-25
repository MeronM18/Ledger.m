import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { GRIP_ON_HOVER } from "@/components/overview/stat-tile";
import { QueryErrorState } from "@/components/query-error";
import { DragHandle } from "@/components/sortable-card-list";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { formatCurrency } from "@/lib/format";
import { loadForecast } from "@/lib/forecast-data";
import { upcomingBills, type CategoryShare } from "@/lib/overview";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LedgerTransaction } from "@/lib/spending-data";
import { humanizeTransaction, prettyName } from "@/lib/transaction-display";
import type { Described, TransactionKind } from "@/lib/transaction-kind";
import { cn } from "@/lib/utils";

const usd = (n: number) => formatCurrency(n, "USD");
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// The account as the rest of the app names it ("Sapphire Preferred ••4657").
const accountName = (a: { name: string; mask: string | null }) => `${prettyName(a.name)}${a.mask ? ` ••${a.mask}` : ""}`;

/** A card's frame on the Overview: its title, a link to the page with more, its grip, and its body. */
function Panel({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card px-5 pt-4 pb-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-sm text-muted-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne">
            {linkLabel} <ArrowRight className="size-3" aria-hidden />
          </Link>
          <DragHandle className={cn("-mr-1.5 ml-0", GRIP_ON_HOVER)} />
        </div>
      </div>
      {children}
    </section>
  );
}

const Figure = ({ children }: { children: React.ReactNode }) => (
  <span className="font-serif text-[1.75rem] leading-none font-medium tracking-[-0.01em] text-bone">{children}</span>
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
                      <span className="line-clamp-2 text-bone">{e.name}</span>
                      <span className="text-xs text-muted-foreground">{dayLabel(e.date)}</span>
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

/** This month's biggest categories, each as its share of what was spent, in the colors Spending uses. */
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
  return (
    <Panel title="Where it went" href="/reports/spending" linkLabel="Spending">
      {error ? (
        <QueryErrorState message="Couldn't load spending." />
      ) : top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No spending in {monthName} yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {top.map((c) => (
            <li key={c.category} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-bone">{c.label}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {usd(c.amount)}
                  <span className="ml-2 text-xs text-muted-foreground">{Math.round(c.share * 100)}%</span>
                </span>
              </span>
              <span className="h-1.5 w-full rounded-full bg-bone/[0.06]" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, c.share * 100)}%`, background: `var(--viz-${c.colorSlot})` }} />
              </span>
            </li>
          ))}
          {rest.count > 0 && (
            <li className="text-xs text-muted-foreground">
              {rest.count} more {rest.count === 1 ? "category" : "categories"}, {usd(rest.amount)}
            </li>
          )}
        </ul>
      )}
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
        <div className="-mx-5">
          <table className="w-full table-fixed text-sm md:table-auto">
            <thead>
              <tr className="border-y border-border bg-muted/30 text-left text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                <th scope="col" className="py-2 pr-3 pl-5 font-medium">
                  Transaction
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Type
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Account
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Date
                </th>
                <th scope="col" className="w-28 py-2 pr-5 pl-3 text-right font-medium md:w-auto">
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
                          <span className="truncate text-xs text-muted-foreground md:hidden">
                            {kind ? `${kind.label} · ` : ""}
                            {dayLabel(t.date)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      {kind && <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ring-1 ring-inset", kind.className)}>{kind.label}</span>}
                    </td>
                    <td className="hidden max-w-48 truncate px-3 py-2.5 text-muted-foreground md:table-cell">{t.account ? accountName(t.account) : "Cash"}</td>
                    <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground md:table-cell">{dayLabel(t.date)}</td>
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
