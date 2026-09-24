import { ForecastChart } from "@/components/forecast-chart";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALERT_THRESHOLDS } from "@/lib/config";
import { loadForecast } from "@/lib/forecast-data";
import { formatCurrency } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const metadata = { title: "Cash flow" };

export default async function CashFlowPage() {
  const data = await loadForecast(createAdminClient());

  if (data.error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Cash flow</h1>
        <QueryErrorState message="Couldn't load your cash flow. Try refreshing the page." />
      </div>
    );
  }

  const { forecast: f, currency, creditOwed, hasCashAccount } = data;

  if (!hasCashAccount) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Cash flow</h1>
        <p className="text-sm text-muted-foreground">
          Connect a checking or savings account on the Accounts page to see what&apos;s safe to spend.
        </p>
      </div>
    );
  }

  const untilLabel = f.nextIncome ? `until ${shortDate(f.nextIncome.date)}` : `over the next ${f.daysToPayday} days`;
  const nothingKnown = f.events.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Cash flow</h1>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">Safe to spend {untilLabel}</p>
              <Money
                amount={f.safeToSpend}
                currency={currency}
                tone={f.safeToSpend >= 0 ? "positive" : "negative"}
                className="text-4xl font-semibold"
              />
              {f.perDay !== null && f.safeToSpend > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  About {formatCurrency(f.perDay, currency)} a day for {f.daysToPayday} days
                  {f.nextIncome ? ` until ${f.nextIncome.name} lands` : ""}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Cash now</dt>
              <dd className="text-right">
                <Money amount={f.cash} currency={currency} tone="neutral" />
              </dd>
              <dt className="text-muted-foreground">Bills due first</dt>
              <dd className="text-right">
                <Money amount={-f.billsBeforePayday} currency={currency} tone="neutral" />
              </dd>
              {f.nextIncome && (
                <>
                  <dt className="text-muted-foreground">Next paycheck</dt>
                  <dd className="text-right">
                    {shortDate(f.nextIncome.date)} · <Money amount={f.nextIncome.amount} currency={currency} tone="positive" />
                  </dd>
                </>
              )}
            </dl>
          </div>

          {f.safeToSpend < 0 && (
            <p className="text-sm text-oxblood-text">
              Bills due before payday add up to more than the cash you have, by {formatCurrency(-f.safeToSpend, currency)}.
            </p>
          )}
          {f.safeToSpend >= 0 && f.projectedShortfall > 0 && f.typicalDailySpend !== null && (
            <p className="text-sm text-champagne">
              At your usual {formatCurrency(f.typicalDailySpend, currency)} a day, you&apos;d spend about{" "}
              {formatCurrency(f.projectedShortfall, currency)} more than is safe before payday.
            </p>
          )}
          {f.firstBelowThreshold && (
            <p className="text-sm text-champagne">
              Your balance is projected to drop under {formatCurrency(ALERT_THRESHOLDS.lowBalance, currency)} on{" "}
              {longDate(f.firstBelowThreshold.date)}
              {f.firstBelowThreshold.balance < 0 ? " and go negative" : ""}, if you spend at your usual pace.
            </p>
          )}
          {!f.nextIncome && (
            <p className="text-sm text-muted-foreground">
              Your income varies, so paychecks aren&apos;t predicted. This covers the next {f.daysToPayday} days, and
              money counts once it lands.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <ForecastChart
            points={f.points}
            showExpected={f.typicalDailySpend !== null}
            threshold={ALERT_THRESHOLDS.lowBalance}
            currency={currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming up</CardTitle>
        </CardHeader>
        <CardContent>
          {nothingKnown ? (
            <p className="text-sm text-muted-foreground">No bills are expected in the next 30 days.</p>
          ) : (
            <div className="flex flex-col">
              {f.events.map((e, i) => (
                <div
                  key={`${e.date}-${e.name}-${i}`}
                  className="flex items-center justify-between border-t border-border py-2.5 first:border-t-0 first:pt-0"
                >
                  <div>
                    <p className="text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{longDate(e.date)}</p>
                  </div>
                  <Money
                    amount={e.amount}
                    currency={currency}
                    tone={e.kind === "income" ? "positive" : "negative"}
                    showSign
                    className="text-sm font-medium"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How this is worked out</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Cash is the available balance across your checking accounts (savings is treated as set aside). Bills come from
            what your bank connection has detected as recurring, plus your manual subscriptions. Anything that hasn&apos;t
            charged for well past its expected date is left out.
          </p>
          <p>
            Income isn&apos;t forecast. Commission pay changes from check to check, so a deposit only counts once it&apos;s
            in your balance.
          </p>
          <p>
            &ldquo;Typical spending&rdquo; is your last 30 days of spending minus those recurring bills
            {f.typicalDailySpend !== null ? `, currently ${formatCurrency(f.typicalDailySpend, currency)} a day` : ""}. It&apos;s
            shown as the dashed line and isn&apos;t deducted from the safe-to-spend number.
          </p>
          {creditOwed > 0 && (
            <p>
              Credit card balances ({formatCurrency(creditOwed, currency)} owed) are not deducted. Only card payments that
              appear as recurring bills are.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
