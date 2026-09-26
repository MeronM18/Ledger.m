import { IncomeReport } from "@/components/income-report";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { incomeKind, incomeStats, isIncomeDeposit, type IncomeMonth } from "@/lib/income";
import type { IncomeEntry } from "@/lib/income-report";
import { effectiveCategory, humanizeTransactionName, prettyName } from "@/lib/transaction-display";
import { loadLedger } from "@/lib/spending-data";
import { incomeAmount } from "@/lib/spending-aggregation";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Income" };

function monthName(m: IncomeMonth, withYear = false): string {
  return new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/**
 * This month against the baseline and the average, on one scale: a filled
 * track for what has come in, a solid tick for the lowest month and a
 * dashed one for the average.
 */
function BaselineScale({
  thisMonth,
  baseline,
  average,
  currency,
}: {
  thisMonth: number;
  baseline: number;
  average: number | null;
  currency: string;
}) {
  const max = Math.max(thisMonth, baseline, average ?? 0) * 1.08 || 1;
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="relative h-2.5 rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 rounded-full bg-moss" style={{ width: at(thisMonth) }} />
        <div className="absolute -inset-y-1.5 w-0.5 rounded-full bg-champagne" style={{ left: at(baseline) }} />
        {average !== null && (
          <div className="absolute -inset-y-1.5 border-l border-dashed border-ash-grey" style={{ left: at(average) }} />
        )}
      </div>
      <div className="relative h-4 text-[11px] text-muted-foreground">
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-champagne" style={{ left: at(baseline) }}>
          Baseline {formatCurrency(baseline, currency)}
        </span>
        {average !== null && Math.abs(average - baseline) / max > 0.22 && (
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: at(average) }}>
            Average {formatCurrency(average, currency)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * What you can count on: the lowest of the last 12 full months as the
 * baseline to budget around, this month against it, and whether a month
 * that slow still covers your usual spending. Whatever the report's filters.
 */
function CountOn({ s, currency }: { s: ReturnType<typeof incomeStats>; currency: string }) {
  const baseline = s.lowest?.income ?? null;
  const thisMonthName = monthName(s.thisMonth);
  const aboveBaseline = baseline !== null ? s.thisMonth.income - baseline : null;
  const cushion = baseline !== null && s.averageSpending !== null ? baseline - s.averageSpending : null;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>What you can count on</CardTitle>
        <p className="text-xs text-muted-foreground">From your last {Math.min(12, s.completeMonths) || 12} full months, whatever the filters above.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {baseline === null || s.lowest === null ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Your baseline appears after your first full month of history. Until then, here&apos;s {thisMonthName} so far:{" "}
            <Money amount={s.thisMonth.income} currency={currency} tone="positive" />.
          </p>
        ) : (
          <>
            <p className="max-w-[62ch] text-base leading-relaxed">
              Your lowest month {s.completeMonths >= 12 ? "in the last year" : `in the last ${s.completeMonths}`} was {monthName(s.lowest, true)}, at{" "}
              <Money amount={baseline} currency={currency} tone="positive" />.{" "}
              <span className="text-muted-foreground">
                Budget your bills and everyday spending around that, and treat anything above it as extra for savings or a goal.
              </span>
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                  {thisMonthName} so far <Money amount={s.thisMonth.income} currency={currency} tone="positive" className="font-medium" />
                </p>
                {aboveBaseline !== null && (
                  <p className={cn("text-sm", aboveBaseline >= 0 ? "text-moss" : "text-muted-foreground")}>
                    {aboveBaseline >= 0
                      ? `${formatCurrency(aboveBaseline, currency)} above your baseline`
                      : `${formatCurrency(-aboveBaseline, currency)} to go to reach your baseline`}
                  </p>
                )}
              </div>
              <BaselineScale thisMonth={s.thisMonth.income} baseline={baseline} average={s.average} currency={currency} />
            </div>
            {cushion !== null && s.averageSpending !== null && (
              <p className="max-w-[62ch] text-sm text-muted-foreground">
                You spend about {formatCurrency(s.averageSpending, currency)} a month.{" "}
                {cushion >= 0
                  ? `A month as slow as your lowest would still cover that, with ${formatCurrency(cushion, currency)} to spare.`
                  : `A month as slow as your lowest would leave you ${formatCurrency(-cushion, currency)} short, so keep that much in savings to fall back on.`}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default async function IncomePage() {
  const ledger = await loadLedger(createAdminClient());
  const now = calendarNow();

  if (ledger.error) {
    return (
      <div className="flex flex-col gap-6">
        <QueryErrorState message="Couldn't load your income. Try refreshing the page." />
      </div>
    );
  }

  const s = incomeStats(ledger.transactions, ledger.spending, now.isoDate);
  const currency = ledger.currency;

  if (s.recent.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          No income has come in yet. Once a paycheck or other deposit lands, this page shows your months side by side.
        </p>
      </div>
    );
  }

  // Every deposit counted as income, the same way the numbers above count it.
  const entries: IncomeEntry[] = ledger.transactions.filter(isIncomeDeposit).map((t) => ({
    id: t.id,
    date: t.date,
    amount: incomeAmount(t),
    source: humanizeTransactionName(t),
    kind: incomeKind(t),
    accountId: t.account?.id ?? null,
  }));
  // Income still pending, listed but not counted until it posts, the way pending charges aren't spending yet.
  const pending: IncomeEntry[] = ledger.transactions
    .filter((t) => t.pending && t.amount < 0 && effectiveCategory(t) === "INCOME")
    .map((t) => ({ id: t.id, date: t.date, amount: incomeAmount(t), source: humanizeTransactionName(t), kind: incomeKind(t), accountId: t.account?.id ?? null }));
  const landedIn = new Set([...entries, ...pending].map((e) => e.accountId).filter(Boolean));
  const accounts = ledger.accounts
    .filter((a) => landedIn.has(a.id))
    .map((a) => ({ id: a.id, label: `${prettyName(a.name)}${a.mask ? ` ••${a.mask}` : ""}` }));

  return (
    <IncomeReport
      entries={entries}
      pending={pending}
      spending={ledger.spending.map((t) => ({ date: t.date, amount: t.amount }))}
      accounts={accounts}
      todayIso={now.isoDate}
      countOn={<CountOn s={s} currency={currency} />}
    />
  );
}
