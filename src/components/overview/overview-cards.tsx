import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { CARD_GRIP } from "@/components/overview/stat-tile";
import { QueryErrorState } from "@/components/query-error";
import { DragHandle } from "@/components/sortable-card-list";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { formatCurrency } from "@/lib/format";
import { loadForecast } from "@/lib/forecast-data";
import { installmentPaymentLabel, installmentPaymentsBetween } from "@/lib/installments";
import { loadSubscriptions } from "@/lib/recurring-extras";
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

/** Bills, subscriptions, card payments and installment payments due in the next two weeks, soonest first. */
async function loadUpcoming(todayIso: string) {
  const admin = createAdminClient();
  const [data, subscriptions] = await Promise.all([loadForecast(admin), loadSubscriptions(admin)]);
  if (data.error) return null;
  // Installment payments too (plans paid off have none).
  const through = new Date(Date.parse(`${todayIso}T00:00:00Z`) + UPCOMING_DAYS * 86_400_000).toISOString().slice(0, 10);
  const installments = subscriptions.error
    ? []
    : installmentPaymentsBetween(subscriptions.installments, todayIso, through).map((d) => ({
        date: d.payment.date,
        name: installmentPaymentLabel(d),
        amount: d.payment.amount,
        kind: "bill" as const,
        installment: true,
      }));
  return upcomingBills([...data.forecast.events, ...installments], todayIso, UPCOMING_DAYS);
}

const daysAway = (iso: string, todayIso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
const whenText = (n: number) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/**
 * The next payment due, large, and what else is due in the next two weeks.
 * Async, for <Suspense>: the forecast it reads loads on its own.
 */
export async function NextPaymentCard({ todayIso }: { todayIso: string }) {
  const upcoming = await loadUpcoming(todayIso);
  const next = upcoming?.items[0] ?? null;
  const rest = upcoming ? upcoming.items.slice(1) : [];
  const kind = next ? (next.kind === "card" ? "Card payment" : "installment" in next ? "Installment" : "Bill") : null;
  return (
    <Panel title="Next payment" href="/recurring" linkLabel="Recurring">
      {upcoming === null ? (
        <QueryErrorState message="Couldn't load what's coming up." />
      ) : next === null ? (
        <p className="text-sm text-muted-foreground">Nothing is due in the next two weeks.</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Figure>{usd(Math.abs(next.amount))}</Figure>
              <span className="truncate text-sm text-bone" title={next.name}>
                {next.kind === "card" ? next.name.replace(/\s+payment$/i, "") : next.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {dayLabel(next.date)} · {whenText(daysAway(next.date, todayIso))}
              </span>
            </div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] text-champagne ring-1 ring-champagne/35 ring-inset">{kind}</span>
          </div>
          {rest.length > 0 && (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              Then {rest.length} more, <span className="font-mono text-bone tabular-nums">{usd(upcoming.total - Math.abs(next.amount))}</span>, in the next {UPCOMING_DAYS} days
            </p>
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
