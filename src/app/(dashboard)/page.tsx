import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttentionCard } from "@/components/attention-card";
import { DragHandle } from "@/components/sortable-card-list";
import { SortableCardGrid, type GridCard } from "@/components/sortable-card-grid";
import { applyCardOrder } from "@/lib/card-order";
import { loadCardOrder } from "@/lib/ui-preferences";
import { GreetingHeader } from "@/components/greeting-header";
import { NetWorthHero } from "@/components/net-worth-hero";
import { OverviewGoalsCard, OverviewGoalsSkeleton } from "@/components/overview-goals-card";
import { SpendingPaceCard } from "@/components/spending-pace-card";
import { SafeToSpendCard, SafeToSpendSkeleton } from "@/components/safe-to-spend-card";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { computeNetWorth, manualAccountsAsAccounts } from "@/lib/net-worth";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { loadLedger } from "@/lib/spending-data";
import { formatCurrency, timeAgo } from "@/lib/format";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";
import { categoryTotalsForMonth, incomeBySourceForMonth, monthlyIncomeVsSpending } from "@/lib/spending-aggregation";
import {
  isWithinNextDays,
  projectNextOccurrence,
  summarizeSubscriptions,
} from "@/lib/subscriptions-aggregation";
import { effectiveNextDate } from "@/lib/subscription-insights";
import { humanizeTransactionName, streamDisplayName } from "@/lib/transaction-display";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { BudgetBar } from "@/components/budgets-manager";
import { attentionItems } from "@/lib/attention";
import { isDisconnected } from "@/lib/item-status";
import { importStatus } from "@/lib/import-reminders";
import { budgetProgress } from "@/lib/budgets";
import { netWorthTrend } from "@/lib/net-worth-trend";
import { paceComparison, previousMonth } from "@/lib/trends";

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

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const admin = createAdminClient();

  const [
    { data: accountsData, error: acctError },
    { data: manualData, error: manualError },
    { data: holdingsData, error: holdingsError },
    { data: pricesData, error: pricesError },
    ledger,
    { data: streamsData, error: streamsError },
    { data: manualSubsData, error: manualSubsError },
    { accounts: manualCards, error: manualCardsError },
    { data: budgetRows, error: budgetsError },
    { data: alertRows, error: alertsError },
    { data: snapshotRows, error: snapshotsError },
    { data: itemRows },
    savedOrder,
  ] = await Promise.all([
    admin.from("accounts").select("type, current_balance").eq("is_hidden", false),
    admin.from("manual_assets").select("value, is_liability"),
    admin.from("precious_metal_holdings").select("metal, weight, weight_unit, purity"),
    admin.from("metal_prices").select("metal, price_per_troy_oz_usd"),
    loadLedger(admin),
    admin
      .from("recurring_streams")
      .select(
        "id, merchant_name, description, average_amount, frequency, predicted_next_date, last_date, is_active, user_marked_cancelled"
      )
      .eq("direction", "outflow"),
    admin
      .from("manual_subscriptions")
      .select("id, name, amount, frequency, next_billing_date, is_active"),
    // Shared with the ledger above (same request), so this isn't a second read.
    loadManualAccounts(admin),
    admin.from("budgets").select("id, category, monthly_amount"),
    admin.from("alert_events").select("id, kind, title, body, created_at").order("created_at", { ascending: false }).limit(5),
    admin.from("net_worth_snapshots").select("date, net_worth").order("date", { ascending: true }),
    admin.from("items").select("id, institution_name, status, error_code"),
    loadCardOrder(admin, "overview"),
  ]);

  if (acctError) console.error("Failed to load accounts for overview", acctError);
  if (manualError) console.error("Failed to load manual assets for overview", manualError);
  if (holdingsError) console.error("Failed to load precious metal holdings for overview", holdingsError);
  if (pricesError) console.error("Failed to load metal prices for overview", pricesError);
  if (streamsError) console.error("Failed to load recurring streams for overview", streamsError);
  if (manualSubsError) console.error("Failed to load manual subscriptions for overview", manualSubsError);
  if (budgetsError) console.error("Failed to load budgets for overview", budgetsError);
  if (alertsError) console.error("Failed to load alerts for overview", alertsError);
  if (snapshotsError) console.error("Failed to load net worth history for overview", snapshotsError);

  const preciousMetalsValue = totalPreciousMetalsValue(holdingsData ?? [], pricesData ?? []);
  const { netWorth } = computeNetWorth(
    [...(accountsData ?? []), ...manualAccountsAsAccounts(manualCards)],
    manualData ?? [],
    preciousMetalsValue
  );

  const allTransactions = ledger.transactions;
  const currency = ledger.currency;
  const spending = ledger.spending;
  const now = calendarNow();
  const categoryTotals = categoryTotalsForMonth(spending, now.year, now.month);
  const monthTotal = categoryTotals.reduce((sum, c) => sum + c.amount, 0);
  const topCategories = [...categoryTotals].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const monthLabel = now.monthLabel;
  const incomeBySource = incomeBySourceForMonth(allTransactions, now.year, now.month);
  const incomeVsSpending = monthlyIncomeVsSpending(allTransactions, now.year, now.month, ledger.connectedCardIssuers);

  const allBudgetProgress = budgetProgress(
    categoryTotals,
    (budgetRows ?? []).map((b) => ({ id: b.id, category: b.category, monthly_amount: Number(b.monthly_amount) })),
    now
  );
  const budgetsToShow = allBudgetProgress.slice(0, 3);

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
      .filter((s) => s.is_active && !s.user_marked_cancelled)
      // A stored predicted_next_date only advances when a new matching
      // charge lands, so once it's passed without one (the normal case for
      // most of a billing cycle) it needs rolling forward to reflect
      // what's actually still coming up.
      .map((s) => ({
        s,
        date: projectNextOccurrence(effectiveNextDate(s.predicted_next_date, s.last_date, s.frequency), s.frequency),
      }))
      .filter(({ date }) => isWithinNextDays(date, UPCOMING_WINDOW_DAYS))
      .map(({ s, date }) => ({
        key: `plaid-${s.id}`,
        label: streamDisplayName(s),
        amount: s.average_amount ?? 0,
        date: date as string,
        isManual: false,
      })),
    ...(manualSubsData ?? [])
      .filter((m) => m.is_active)
      .map((m) => ({ m, date: projectNextOccurrence(m.next_billing_date, m.frequency) }))
      .filter(({ date }) => isWithinNextDays(date, UPCOMING_WINDOW_DAYS))
      .map(({ m, date }) => ({
        key: `manual-${m.id}`,
        label: m.name,
        amount: m.amount,
        date: date as string,
        isManual: true,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // The ledger is already newest first, Plaid and manual together.
  const recent = allTransactions.slice(0, 5);

  const trend = netWorthTrend(
    (snapshotRows ?? []).map((r) => ({ date: r.date as string, net_worth: Number(r.net_worth) })),
    netWorth,
    now.isoDate
  );
  const pace = paceComparison(
    spending,
    { year: now.year, month: now.month },
    { year: now.year, month: now.month, day: Number(now.isoDate.slice(8, 10)) }
  );
  const prev = previousMonth({ year: now.year, month: now.month });
  const previousMonthName = new Date(prev.year, prev.month, 1).toLocaleDateString("en-US", { month: "long" });
  const disconnected = (itemRows ?? [])
    .filter((i) => isDisconnected(i))
    .map((i) => ({ id: i.id as string, name: (i.institution_name as string | null) ?? "a bank" }));
  const importsDue = manualCards.flatMap((a) => {
    const status = importStatus(a.lastImportedAt, now.isoDate);
    return status?.overdue ? [{ id: a.id, name: a.name, status }] : [];
  });
  const attention = attentionItems(allBudgetProgress, upcoming, now.isoDate, currency, disconnected, importsDue);

  const netWorthError = Boolean(acctError || manualError || holdingsError || pricesError || manualCardsError);
  const spendingError = ledger.error;
  const subscriptionsError = Boolean(streamsError || manualSubsError);
  const recentTransactionsError = ledger.error;

  // Every card can be moved (the grip on its top edge); the order is saved
  // and applied here, so the page arrives already arranged.
  const overviewCards: GridCard[] = [
    {
      id: "net-worth",
      label: "Net worth",
      span: "full",
      node: (
        <NetWorthHero netWorth={netWorth} trend={trend} error={netWorthError} currency="USD" />
      ),
    },
    // Only when there's something to act on; an empty one would leave a gap.
    ...(attention.length > 0
      ? [{ id: "attention", label: "Needs your attention", span: "full" as const, node: <AttentionCard items={attention} /> }]
      : []),
    {
      id: "safe-to-spend",
      label: "Safe to spend",
      span: "half",
      node: (
        <Suspense fallback={<SafeToSpendSkeleton />}>
          <SafeToSpendCard />
        </Suspense>
      ),
    },
    {
      id: "spending-pace",
      label: "Spending pace",
      span: "half",
      node: (
        <SpendingPaceCard pace={pace} monthRef={{ year: now.year, month: now.month }} previousMonthName={previousMonthName} currency={currency} error={spendingError} />
      ),
    },
    {
      id: "budgets",
      label: "Budgets",
      span: "half",
      node: (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <DragHandle />
              <CardTitle>Budgets</CardTitle>
            </div>
            <SectionLink href="/budgets" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {budgetsError || spendingError ? (
              <QueryErrorState message="Couldn't load budgets." />
            ) : budgetsToShow.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No budgets yet.{" "}
                <Link href="/budgets" className="text-champagne hover:underline">
                  Set one up
                </Link>
                .
              </p>
            ) : (
              budgetsToShow.map((b) => (
                <div key={b.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{b.label}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(b.spent, currency)} of {formatCurrency(b.budget, currency)}
                    </span>
                  </div>
                  <BudgetBar progress={b} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: "goals",
      label: "Goals",
      span: "half",
      node: (
        <Suspense fallback={<OverviewGoalsSkeleton />}>
          <OverviewGoalsCard />
        </Suspense>
      ),
    },
    {
      id: "month-spending",
      label: `${monthLabel} spending`,
      span: "half",
      node: (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <DragHandle />
              <CardTitle>{monthLabel} spending</CardTitle>
            </div>
            <SectionLink href="/reports/spending" />
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
      ),
    },
    {
      id: "subscriptions",
      label: "Subscriptions",
      span: "half",
      node: (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <DragHandle />
              <CardTitle>Subscriptions</CardTitle>
            </div>
            <SectionLink href="/recurring" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {subscriptionsError ? (
              <QueryErrorState message="Couldn't load subscriptions." />
            ) : (
              <>
                <div className="flex flex-col gap-1">
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
      ),
    },
    {
      id: "upcoming",
      label: "Upcoming",
      span: "half",
      node: (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <DragHandle />
              <CardTitle>Upcoming</CardTitle>
            </div>
            <SectionLink href="/recurring" />
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
      ),
    },
    {
      id: "alerts",
      label: "Recent alerts",
      span: "half",
      node: (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <DragHandle />
            <CardTitle>Recent alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {alertsError ? (
              <QueryErrorState message="Couldn't load alerts." />
            ) : !alertRows || alertRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing to flag. Budget, renewal, price and low-balance alerts show up here and on your phone.
              </p>
            ) : (
              <div className="flex flex-col">
                {alertRows.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start justify-between gap-4 border-t border-border py-3 first:border-t-0 first:pt-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.body}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: "month-income",
      label: `${monthLabel} income`,
      span: "full",
      node: (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <DragHandle />
              <CardTitle>{monthLabel} income</CardTitle>
            </div>
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
                    <span className={incomeVsSpending.net >= 0 ? "text-moss" : "text-oxblood-text"}>
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
      ),
    },
    {
      id: "recent-transactions",
      label: "Recent transactions",
      span: "full",
      node: (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <DragHandle />
              <CardTitle>Recent transactions</CardTitle>
            </div>
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
                      className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <TransactionAvatar transaction={t} />
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                          <span className="truncate">{merchant}</span>
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
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <GreetingHeader />
      <SortableCardGrid page="overview" cards={applyCardOrder(overviewCards, (c) => c.id, savedOrder)} />
    </div>
  );
}
