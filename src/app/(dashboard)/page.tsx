import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GreetingHeader } from "@/components/greeting-header";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { computeNetWorth } from "@/lib/net-worth";
import { formatCurrency } from "@/lib/format";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";
import {
  categoryTotalsForMonth,
  filterSpendingTransactions,
  incomeBySourceForMonth,
  manualTransactionToSpendingTransaction,
  monthlyIncomeVsSpending,
} from "@/lib/spending-aggregation";
import { isWithinNextDays, summarizeSubscriptions } from "@/lib/subscriptions-aggregation";
import { humanizeTransactionName } from "@/lib/transaction-display";
import { createAdminClient } from "@/lib/supabase/admin";

type RecentTransaction = {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  logo_url: string | null;
  amount: number;
  iso_currency_code: string | null;
  pending: boolean;
  isManual: boolean;
};

function SectionLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne"
    >
      View all <ArrowRight className="size-3" />
    </Link>
  );
}

export default async function OverviewPage() {
  const admin = createAdminClient();

  const [
    { data: accountsData, error: acctError },
    { data: manualData, error: manualError },
    { data: holdingsData, error: holdingsError },
    { data: pricesData, error: pricesError },
    { data: txData, error: txError },
    { data: manualTxData, error: manualTxError },
    { data: streamsData, error: streamsError },
    { data: manualSubsData, error: manualSubsError },
    { data: recentData, error: recentError },
    { data: recentManualData, error: recentManualError },
    { data: creditAccounts, error: creditAcctError },
  ] = await Promise.all([
    admin.from("accounts").select("type, current_balance"),
    admin.from("manual_assets").select("value, is_liability"),
    admin.from("precious_metal_holdings").select("metal, weight, weight_unit, purity"),
    admin.from("metal_prices").select("metal, price_per_troy_oz_usd"),
    admin
      .from("transactions")
      .select("date, amount, pfc_primary, pfc_detailed, merchant_name, name, pending, iso_currency_code"),
    admin.from("manual_transactions").select("date, name, amount, pfc_primary"),
    admin
      .from("recurring_streams")
      .select(
        "id, merchant_name, description, average_amount, frequency, predicted_next_date, is_active, user_marked_cancelled"
      )
      .eq("direction", "outflow"),
    admin
      .from("manual_subscriptions")
      .select("id, name, amount, frequency, next_billing_date, is_active"),
    admin
      .from("transactions")
      .select("id, date, name, merchant_name, logo_url, amount, iso_currency_code, pending")
      .order("date", { ascending: false })
      .limit(5),
    admin
      .from("manual_transactions")
      .select("id, date, name, amount")
      .order("date", { ascending: false })
      .limit(5),
    admin.from("accounts").select("item:items(institution_name)").eq("type", "credit"),
  ]);

  if (acctError) console.error("Failed to load accounts for overview", acctError);
  if (manualError) console.error("Failed to load manual assets for overview", manualError);
  if (holdingsError) console.error("Failed to load precious metal holdings for overview", holdingsError);
  if (pricesError) console.error("Failed to load metal prices for overview", pricesError);
  if (txError) console.error("Failed to load transactions for overview", txError);
  if (manualTxError) console.error("Failed to load manual transactions for overview", manualTxError);
  if (streamsError) console.error("Failed to load recurring streams for overview", streamsError);
  if (manualSubsError) console.error("Failed to load manual subscriptions for overview", manualSubsError);
  if (recentError) console.error("Failed to load recent transactions for overview", recentError);
  if (recentManualError) console.error("Failed to load recent manual transactions for overview", recentManualError);
  if (creditAcctError) console.error("Failed to load connected credit accounts for overview", creditAcctError);

  const preciousMetalsValue = totalPreciousMetalsValue(holdingsData ?? [], pricesData ?? []);
  const { netWorth } = computeNetWorth(accountsData ?? [], manualData ?? [], preciousMetalsValue);

  const allTransactions = [
    ...(txData ?? []),
    ...(manualTxData ?? []).map(manualTransactionToSpendingTransaction),
  ];
  const currency = txData?.[0]?.iso_currency_code ?? "USD";

  // Only institutions with a connected *credit*-type account count as a
  // "connected card" for the payment-exclusion rule — a connected
  // savings/checking account at the same institution a card payment happens
  // to be processed under (Amex here is a savings account, not a card)
  // must never accidentally suppress that payment as if it were the card
  // itself.
  const connectedCardIssuers = Array.from(
    new Set(
      (creditAccounts ?? [])
        .map((a) => (a.item as unknown as { institution_name: string | null } | null)?.institution_name)
        .filter((name): name is string => Boolean(name))
    )
  );

  const spending = filterSpendingTransactions(allTransactions, connectedCardIssuers);
  const now = new Date();
  const categoryTotals = categoryTotalsForMonth(spending, now.getFullYear(), now.getMonth());
  const monthTotal = categoryTotals.reduce((sum, c) => sum + c.amount, 0);
  const topCategories = [...categoryTotals].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const incomeBySource = incomeBySourceForMonth(allTransactions, now.getFullYear(), now.getMonth());
  const incomeVsSpending = monthlyIncomeVsSpending(allTransactions, now.getFullYear(), now.getMonth());

  const manualSubsAsStreams = (manualSubsData ?? []).map((m) => ({
    average_amount: m.amount,
    frequency: m.frequency,
    is_active: m.is_active,
    user_marked_cancelled: false,
  }));
  const { active, monthlyTotal } = summarizeSubscriptions([
    ...(streamsData ?? []),
    ...manualSubsAsStreams,
  ]);

  // "What's about to charge" — active, not cancelled, with a predicted date
  // in the near future. A charge whose predicted date has already passed
  // belongs to the lapsed-flag treatment on /subscriptions, not here.
  const UPCOMING_WINDOW_DAYS = 14;
  type UpcomingCharge = { key: string; label: string; amount: number; date: string; isManual: boolean };
  const upcoming: UpcomingCharge[] = [
    ...(streamsData ?? [])
      .filter((s) => s.is_active && !s.user_marked_cancelled && isWithinNextDays(s.predicted_next_date, UPCOMING_WINDOW_DAYS))
      .map((s) => ({
        key: `plaid-${s.id}`,
        label: s.merchant_name || s.description || "Unknown",
        amount: s.average_amount ?? 0,
        date: s.predicted_next_date as string,
        isManual: false,
      })),
    ...(manualSubsData ?? [])
      .filter((m) => m.is_active && isWithinNextDays(m.next_billing_date, UPCOMING_WINDOW_DAYS))
      .map((m) => ({
        key: `manual-${m.id}`,
        label: m.name,
        amount: m.amount,
        date: m.next_billing_date as string,
        isManual: true,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Merge the two sources' own top-5s, then re-take the top 5 overall —
  // fetching 5 from each and re-slicing guarantees correctness even when a
  // manual entry is more recent than some/all of the Plaid ones, rather
  // than always showing 5 Plaid rows plus manual ones bolted on separately.
  const recent = [
    ...((recentData ?? []) as Omit<RecentTransaction, "isManual">[]).map((t) => ({ ...t, isManual: false })),
    ...(recentManualData ?? []).map((m) => ({
      id: m.id,
      date: m.date,
      name: null,
      merchant_name: m.name,
      logo_url: null,
      amount: m.amount,
      iso_currency_code: null,
      pending: false,
      isManual: true,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const netWorthError = Boolean(acctError || manualError || holdingsError || pricesError);
  const spendingError = Boolean(txError || manualTxError || creditAcctError);
  const subscriptionsError = Boolean(streamsError || manualSubsError);
  const recentTransactionsError = Boolean(recentError || recentManualError);

  return (
    <div className="flex flex-col gap-6">
      <GreetingHeader />

      <Card className="border-champagne/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Net worth</CardTitle>
          <SectionLink href="/assets" />
        </CardHeader>
        <CardContent>
          {netWorthError ? (
            <QueryErrorState message="Couldn't load net worth." />
          ) : (
            <span
              className={`font-serif text-3xl font-semibold tabular-nums ${
                netWorth < 0 ? "text-oxblood" : "text-moss"
              }`}
            >
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(netWorth)}
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{monthLabel} spending</CardTitle>
            <SectionLink href="/spending" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {spendingError ? (
              <QueryErrorState message="Couldn't load spending." />
            ) : (
              <>
                <Money amount={monthTotal} currency={currency} tone="negative" className="text-2xl font-semibold" />
                {topCategories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No spending recorded yet.</p>
                ) : (
                  <div className="flex flex-col">
                    {topCategories.map((c) => (
                      <div
                        key={c.category}
                        className="flex items-center justify-between border-t border-border py-2 first:border-t-0 first:pt-0"
                      >
                        <span className="text-sm text-muted-foreground">{c.label}</span>
                        <Money amount={c.amount} currency={currency} tone="negative" className="text-sm font-medium" />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Subscriptions</CardTitle>
            <SectionLink href="/subscriptions" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {subscriptionsError ? (
              <QueryErrorState message="Couldn't load subscriptions." />
            ) : (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Monthly cost</p>
                  <Money amount={monthlyTotal} tone="negative" className="text-2xl font-semibold" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {active.length} active subscription{active.length === 1 ? "" : "s"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{monthLabel} income</CardTitle>
          <SectionLink href="/transactions" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {spendingError ? (
            <QueryErrorState message="Couldn't load income." />
          ) : incomeVsSpending.income === 0 ? (
            <p className="text-sm text-muted-foreground">No income recorded yet this month.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <Money amount={incomeVsSpending.income} currency={currency} tone="positive" className="text-2xl font-semibold" />
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(incomeVsSpending.income, currency)} in ·{" "}
                  {formatCurrency(incomeVsSpending.spending, currency)} out · net{" "}
                  <span className={incomeVsSpending.net >= 0 ? "text-moss" : "text-oxblood"}>
                    {formatCurrency(incomeVsSpending.net, currency)}
                  </span>
                </p>
              </div>
              {incomeBySource.length > 0 && (
                <div className="flex flex-col">
                  {incomeBySource.map((s) => (
                    <div
                      key={s.source}
                      className="flex items-center justify-between border-t border-border py-2 first:border-t-0 first:pt-0"
                    >
                      <span className="text-sm text-muted-foreground">{s.source}</span>
                      <Money amount={s.amount} currency={currency} tone="positive" className="text-sm font-medium" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Upcoming</CardTitle>
          <SectionLink href="/subscriptions" />
        </CardHeader>
        <CardContent>
          {subscriptionsError ? (
            <QueryErrorState message="Couldn't load upcoming charges." />
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing predicted to charge in the next {UPCOMING_WINDOW_DAYS} days.
            </p>
          ) : (
            <div className="flex flex-col">
              {upcoming.map((u) => (
                <div
                  key={u.key}
                  className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{u.label}</span>
                    {u.isManual && (
                      <Badge variant="secondary" className="text-[10px]">
                        Manual
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      {new Date(`${u.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <Money amount={u.amount} tone="negative" className="text-sm font-medium" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent transactions</CardTitle>
          <SectionLink href="/transactions" />
        </CardHeader>
        <CardContent>
          {recentTransactionsError ? (
            <QueryErrorState message="Couldn't load recent transactions." />
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="flex flex-col">
              {recent.map((t) => {
                const isDebit = t.amount >= 0; // Plaid: positive = money out
                const merchant = humanizeTransactionName(t);

                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center gap-3">
                      {t.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external Plaid-hosted logo, small avatar, not worth next/image config for a single-user app
                        <img
                          src={t.logo_url}
                          alt=""
                          className="size-6 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Store className="size-3.5" />
                        </span>
                      )}
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {merchant}
                        {t.isManual && (
                          <Badge variant="secondary" className="text-[10px]">
                            Manual
                          </Badge>
                        )}
                        {t.pending && (
                          <Badge variant="secondary" className="text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </span>
                    </div>
                    <Money
                      amount={t.amount}
                      currency={t.iso_currency_code}
                      tone={isDebit ? "negative" : "positive"}
                      showSign
                      className="text-sm font-medium"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
