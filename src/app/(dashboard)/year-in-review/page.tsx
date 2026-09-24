import Link from "next/link";
import { IncomeChart } from "@/components/income-chart";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { IncomeMonth } from "@/lib/income";
import { humanizeCategory } from "@/lib/plaid-categories";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import { yearReview, yearsWithHistory } from "@/lib/year-review";

export const metadata = { title: "Year in review" };

function monthName(m: IncomeMonth): string {
  return new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long" });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "brought in 12% more", "spent about the same" */
function change(verb: string, now: number, before: number): string | null {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? `${verb} about the same` : `${verb} ${Math.abs(pct)}% ${pct > 0 ? "more" : "less"}`;
}

function MonthCallout({
  title,
  month,
  children,
}: {
  title: string;
  month: IncomeMonth | null;
  children: (m: IncomeMonth) => React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-border pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      {month ? (
        <>
          <p className="font-serif text-lg text-bone">{monthName(month)}</p>
          <p className="text-sm text-muted-foreground">{children(month)}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Needs a finished month</p>
      )}
    </div>
  );
}

export default async function YearInReviewPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const [ledger, params] = await Promise.all([loadLedger(createAdminClient()), searchParams]);
  const now = calendarNow();

  if (ledger.error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Year in review</h1>
        <QueryErrorState message="Couldn't load your year. Try refreshing the page." />
      </div>
    );
  }

  const years = yearsWithHistory(ledger.transactions);
  const requested = Number(params.year);
  const year = years.includes(requested) ? requested : (years[0] ?? now.year);
  const r = yearReview(ledger.transactions, ledger.spending, year, now.isoDate);
  const currency = ledger.currency;
  const comparison = r.previous
    ? [change("brought in", r.income, r.previous.income), change("spent", r.spending, r.previous.spending)].filter(Boolean)
    : [];
  const topCategory = r.categories[0]?.amount ?? 0;
  const topMerchant = r.merchants[0]?.amount ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold text-bone">Year in review</h1>
        {years.length > 1 && (
          <nav aria-label="Year" className="flex flex-wrap gap-1">
            {years.map((y) => (
              <Link
                key={y}
                href={`/year-in-review?year=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 font-mono text-sm tabular-nums transition-colors",
                  y === year ? "bg-muted text-champagne" : "text-muted-foreground hover:text-bone"
                )}
              >
                {y}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {r.transactionCount === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <p className="font-serif text-5xl leading-none text-bone md:text-6xl">
                  {r.year}
                  {r.inProgress && <span className="ml-3 align-middle font-sans text-sm text-muted-foreground">so far</span>}
                </p>
                <p className="max-w-[62ch] text-base leading-relaxed">
                  You brought in <Money amount={r.income} currency={currency} tone="positive" /> and spent{" "}
                  <Money amount={r.spending} currency={currency} tone="negative" />,{" "}
                  {r.kept >= 0 ? (
                    <>
                      keeping <Money amount={r.kept} currency={currency} tone="positive" />
                      {r.savingsRate !== null && ` (${Math.round(r.savingsRate * 100)}% of what came in)`}.
                    </>
                  ) : (
                    <>
                      <Money amount={-r.kept} currency={currency} tone="negative" /> more than came in.
                    </>
                  )}
                </p>
                {comparison.length > 0 && (
                  <p className="max-w-[62ch] text-sm text-muted-foreground">
                    Compared with {r.inProgress ? `the same stretch of ${r.year - 1}` : r.year - 1}, you{" "}
                    {comparison.join(" and ")}.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <MonthCallout title="Best month" month={r.bestMonth}>
                  {(m) => `Kept ${formatCurrency(m.net, currency)}`}
                </MonthCallout>
                <MonthCallout title="Hardest month" month={r.hardestMonth}>
                  {(m) =>
                    m.net < 0
                      ? `Spent ${formatCurrency(-m.net, currency)} more than came in`
                      : `Kept only ${formatCurrency(m.net, currency)}`
                  }
                </MonthCallout>
                <MonthCallout title="Most spent" month={r.highestSpendingMonth}>
                  {(m) => formatCurrency(m.spending, currency)}
                </MonthCallout>
                <MonthCallout title="Least spent" month={r.lowestSpendingMonth}>
                  {(m) => formatCurrency(m.spending, currency)}
                </MonthCallout>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Month by month</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeChart months={r.months} average={null} baseline={null} currency={currency} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Where it went</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5">
                {r.categories.length === 0 && <p className="text-sm text-muted-foreground">No spending this year.</p>}
                {r.categories.map((c) => (
                  <div key={c.category} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: `var(--viz-${c.colorSlot})` }} aria-hidden />
                        <span className="truncate">{c.label}</span>
                      </span>
                      <span className="flex items-baseline gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">{Math.round(c.share * 100)}%</span>
                        <Money amount={c.amount} currency={currency} />
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(1.5, (c.amount / topCategory) * 100)}%`, background: `var(--viz-${c.colorSlot})` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top merchants</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5">
                {r.merchants.map((m, i) => (
                  <div key={m.merchant} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-baseline gap-2.5">
                        <span className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                        <span className="truncate">{m.merchant}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {m.count} {m.count === 1 ? "visit" : "visits"}
                        </span>
                      </span>
                      <Money amount={m.amount} currency={currency} />
                    </div>
                    <div className="ml-6.5 h-1 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-champagne/70" style={{ width: `${(m.amount / topMerchant) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Biggest one-off purchases</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col">
                {r.largestPurchases.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nothing outside your regular bills yet.</p>
                )}
                {r.largestPurchases.map((p, i) => (
                  <div
                    key={`${p.date}-${p.merchant}-${i}`}
                    className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.merchant}</p>
                      <p className="text-xs text-muted-foreground">
                        {shortDate(p.date)} · {humanizeCategory(p.category)}
                      </p>
                    </div>
                    <Money amount={p.amount} currency={currency} tone="negative" className="text-sm" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>For tax time</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">Income received</p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 text-sm">
                    {r.incomeSources.map((src) => (
                      <div key={src.source} className="contents">
                        <dt className="min-w-0 truncate">{src.source}</dt>
                        <dd className="text-right">
                          <Money amount={src.amount} currency={currency} tone="positive" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">Other totals</p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 text-sm">
                    <dt>Interest earned</dt>
                    <dd className="text-right">
                      <Money amount={r.tax.interest} currency={currency} />
                    </dd>
                    <dt>Charitable donations</dt>
                    <dd className="text-right">
                      <Money amount={r.tax.donations} currency={currency} />
                    </dd>
                    <dt>Medical spending</dt>
                    <dd className="text-right">
                      <Money amount={r.tax.medical} currency={currency} />
                    </dd>
                    {r.tax.taxesPaid > 0 && (
                      <>
                        <dt>Tax payments</dt>
                        <dd className="text-right">
                          <Money amount={r.tax.taxesPaid} currency={currency} />
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
                <p className="text-xs text-muted-foreground">
                  Added up from your bank transactions, so paychecks are after tax and withholding. Check them against
                  your W-2, 1099s and receipts; this isn&apos;t tax advice.
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            {r.transactionCount.toLocaleString("en-US")} transactions in {r.year}
            {r.inProgress ? " so far" : ""}.
          </p>
        </>
      )}
    </div>
  );
}
