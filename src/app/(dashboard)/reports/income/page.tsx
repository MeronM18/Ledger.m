import { IncomeChart } from "@/components/income-chart";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { incomeStats, type IncomeMonth } from "@/lib/income";
import { loadLedger } from "@/lib/spending-data";
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

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function percent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const VARIABILITY_LABEL = { steady: "Steady", uneven: "Uneven", "very uneven": "Very uneven" } as const;

function Stat({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{children}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
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

  const baseline = s.lowest?.income ?? null;
  const thisMonthName = monthName(s.thisMonth);
  const aboveBaseline = baseline !== null ? s.thisMonth.income - baseline : null;
  const baselineCushion = baseline !== null && s.averageSpending !== null ? baseline - s.averageSpending : null;
  const ytdChange = s.ytdLastYear && s.ytdLastYear > 0 ? (s.ytd - s.ytdLastYear) / s.ytdLastYear : null;
  const tableMonths = [...s.months].reverse();
  const topSource = s.sources[0]?.amount ?? 0;

  return (
    <div className="flex flex-col gap-6">

      <Card>
        <CardHeader>
          <CardTitle>What you can count on</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {baseline === null || s.lowest === null ? (
            <p className="max-w-prose text-sm text-muted-foreground">
              Your baseline appears after your first full month of history. Until then, here&apos;s{" "}
              {thisMonthName} so far: <Money amount={s.thisMonth.income} currency={currency} tone="positive" />.
            </p>
          ) : (
            <>
              <p className="max-w-[62ch] text-base leading-relaxed">
                Your lowest month {s.completeMonths >= 12 ? "in the last year" : `in the last ${s.completeMonths}`} was{" "}
                {monthName(s.lowest, true)}, at <Money amount={baseline} currency={currency} tone="positive" />.{" "}
                <span className="text-muted-foreground">
                  Budget your bills and everyday spending around that, and treat anything above it as extra for
                  savings or a goal.
                </span>
              </p>

              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">
                    {thisMonthName} so far{" "}
                    <Money amount={s.thisMonth.income} currency={currency} tone="positive" className="font-medium" />
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

              {baselineCushion !== null && s.averageSpending !== null && (
                <p className="max-w-[62ch] text-sm text-muted-foreground">
                  You spend about {formatCurrency(s.averageSpending, currency)} a month.{" "}
                  {baselineCushion >= 0
                    ? `A month as slow as your lowest would still cover that, with ${formatCurrency(baselineCushion, currency)} to spare.`
                    : `A month as slow as your lowest would leave you ${formatCurrency(-baselineCushion, currency)} short, so keep that much in savings to fall back on.`}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <Stat
              label={`${now.year} so far`}
              note={
                ytdChange !== null
                  ? `${ytdChange >= 0 ? "Up" : "Down"} ${percent(Math.abs(ytdChange))} on this point last year`
                  : `Spent ${formatCurrency(s.ytdSpending, currency)} over the same stretch`
              }
            >
              <Money amount={s.ytd} currency={currency} tone="positive" />
            </Stat>
            <Stat
              label="Average month"
              note={
                s.median !== null
                  ? `Median ${formatCurrency(s.median, currency)} · last ${s.completeMonths} months`
                  : undefined
              }
            >
              {s.average !== null ? <Money amount={s.average} currency={currency} tone="positive" /> : "—"}
            </Stat>
            <Stat
              label="How much it swings"
              note={s.variability ? `${VARIABILITY_LABEL[s.variability]} month to month` : "Needs two full months"}
            >
              {s.spread !== null ? (
                <span className="font-mono tabular-nums text-bone">±{formatCurrency(s.spread, currency)}</span>
              ) : (
                "—"
              )}
            </Stat>
            <Stat
              label="Kept after spending"
              note={
                s.monthsSpendingOverIncome > 0
                  ? `Spending beat income in ${s.monthsSpendingOverIncome} of ${s.completeMonths} months`
                  : `Of income, over the last ${s.completeMonths} months`
              }
            >
              {s.savingsRate !== null ? (
                <span className={cn("font-mono tabular-nums", s.savingsRate >= 0 ? "text-moss" : "text-oxblood-text")}>
                  {percent(s.savingsRate)}
                </span>
              ) : (
                "—"
              )}
            </Stat>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Month by month</CardTitle>
          {s.highest && s.lowest && s.highest.month !== s.lowest.month && (
            <p className="text-xs text-muted-foreground">
              Best {monthName(s.highest)} · slowest {monthName(s.lowest)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <IncomeChart months={s.months} average={s.average} baseline={baseline} currency={currency} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where it came from</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {s.sources.map((src) => (
              <div key={src.source} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{src.source}</p>
                  <Money amount={src.amount} currency={currency} tone="positive" className="text-sm" />
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-moss/80"
                    style={{ width: `${Math.max(2, (src.amount / topSource) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {src.count} {src.count === 1 ? "deposit" : "deposits"}
                  {src.kind === "interest" ? " · interest" : ""}
                </p>
              </div>
            ))}
            {s.months[0] && <p className="text-xs text-muted-foreground">Since {monthName(s.months[0], true)}.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paychecks</CardTitle>
          </CardHeader>
          <CardContent>
            {s.paychecks.last === null ? (
              <p className="text-sm text-muted-foreground">No paychecks found yet.</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Last one</dt>
                <dd className="text-right">
                  <Money amount={s.paychecks.last.amount} currency={currency} tone="positive" />
                  <span className="block text-xs text-muted-foreground">
                    {shortDate(s.paychecks.last.date)}
                    {s.paychecks.daysSinceLast !== null &&
                      ` · ${s.paychecks.daysSinceLast === 0 ? "today" : `${s.paychecks.daysSinceLast} days ago`}`}
                  </span>
                </dd>
                {s.paychecks.average !== null && (
                  <>
                    <dt className="text-muted-foreground">Average</dt>
                    <dd className="text-right">
                      <Money amount={s.paychecks.average} currency={currency} tone="positive" />
                    </dd>
                  </>
                )}
                {s.paychecks.largest && (
                  <>
                    <dt className="text-muted-foreground">Largest</dt>
                    <dd className="text-right">
                      <Money amount={s.paychecks.largest.amount} currency={currency} tone="positive" />
                      <span className="block text-xs text-muted-foreground">{shortDate(s.paychecks.largest.date)}</span>
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Count</dt>
                <dd className="text-right font-mono tabular-nums">{s.paychecks.count}</dd>
                {s.paychecks.typicalGapDays !== null && (
                  <>
                    <dt className="text-muted-foreground">Usually every</dt>
                    <dd className="text-right">{Math.round(s.paychecks.typicalGapDays)} days</dd>
                  </>
                )}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every month</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-normal">Month</th>
                <th className="pb-2 text-right font-normal">Income</th>
                <th className="pb-2 text-right font-normal">Spending</th>
                <th className="pb-2 text-right font-normal">Kept</th>
              </tr>
            </thead>
            <tbody>
              {tableMonths.map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-2.5">
                    {monthName(m, true)}
                    {!m.complete && <span className="ml-2 text-xs text-muted-foreground">so far</span>}
                  </td>
                  <td className="py-2.5 text-right">
                    <Money amount={m.income} currency={currency} tone="positive" />
                  </td>
                  <td className="py-2.5 text-right">
                    <Money amount={m.spending} currency={currency} tone="neutral" />
                  </td>
                  <td className="py-2.5 text-right">
                    <Money amount={m.net} currency={currency} tone={m.net >= 0 ? "positive" : "negative"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deposits</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          {s.recent.map((d, i) => (
            <div
              key={`${d.date}-${d.source}-${i}`}
              className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.source}</p>
                <p className="text-xs text-muted-foreground">{shortDate(d.date)}</p>
              </div>
              <Money amount={d.amount} currency={currency} tone="positive" showSign className="text-sm font-medium" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
