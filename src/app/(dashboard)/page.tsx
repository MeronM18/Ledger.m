import { Suspense } from "react";
import { DepositReviewCard } from "@/components/deposit-review";
import { GreetingHeader } from "@/components/greeting-header";
import { SubscriptionReviewCard } from "@/components/subscription-review";
import { MonthChart } from "@/components/overview/month-chart";
import {
  AccountNotices,
  BudgetCard,
  GoalsCard,
  PanelSkeleton,
  RecentTransactionsCard,
  SafeToSpendCard,
  UpcomingCard,
  WhereItWentCard,
} from "@/components/overview/overview-cards";
import { StatTile, type TileChange } from "@/components/overview/stat-tile";
import { SortableCardGrid, type GridCard } from "@/components/sortable-card-grid";
import { budgetPlan, budgetProgress, monthCategorySpending } from "@/lib/budgets";
import { applyCardOrder } from "@/lib/card-order";
import { importStatus } from "@/lib/import-reminders";
import { isDisconnected } from "@/lib/item-status";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { chargeOptions, depositsToReview } from "@/lib/deposit-review";
import { computeNetWorth, manualAccountsAsAccounts } from "@/lib/net-worth";
import { netWorthTrend } from "@/lib/net-worth-trend";
import {
  budgetSuggestion,
  cumulative,
  dailySpending,
  incomeByMonth,
  incomeSoFar,
  liquidCash,
  monthEndPace,
  shiftMonth,
  spendingByMonth,
  spendingSoFar,
  whereItWent,
} from "@/lib/overview";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadForecast } from "@/lib/forecast-data";
import { loadGoals } from "@/lib/goals-data";
import { loadSubscriptions } from "@/lib/recurring-extras";
import { calendarNow } from "@/lib/time";
import { describeTransactions } from "@/lib/transaction-kind";
import { loadCardOrder, loadDepositReviews, loadDisplayName, loadMonthlyBudget } from "@/lib/ui-preferences";

export const metadata = { title: "Overview" };

const whole = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "$3,586" large with ".43" small beside it: whole dollars read at a glance, cents still there. */
function Amount({ value }: { value: number }) {
  const [dollars, cents] = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(value)).split(".");
  return (
    <>
      {value < 0 ? "−" : ""}
      {dollars}
      <span className="text-[0.55em] text-bone/60">.{cents}</span>
    </>
  );
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

/**
 * How a figure moved against a month or a date before, as the tile's chip:
 * an arrow and a percentage, in a quiet tone. A comparison isn't an alarm
 * (pay varies from month to month); red is kept for being over budget.
 */
function movement(share: number | null, against: string): TileChange | null {
  if (share === null || !Number.isFinite(share)) return null;
  const pct = Math.round(Math.abs(share) * 100);
  if (pct === 0) return { text: "0%", direction: null, tone: "quiet", label: `the same as ${against}` };
  const up = share > 0;
  return { text: `${pct}%`, direction: up ? "up" : "down", tone: "quiet", label: `${pct}% ${up ? "more" : "less"} than ${against}` };
}

// A card added to the Overview lands where it's designed to sit, even in a layout you've rearranged.
const IN_PLACE = { fresh: "in-place" } as const;

// The newest charges sent along for "paid me back", to pick from or search.
const CHARGES_SENT = 300;

export default async function OverviewPage() {
  const admin = createAdminClient();
  // The Safe to spend, Upcoming and Goals cards load on their own (in
  // Suspense); starting those reads now, beside the page's, means they're ready sooner.
  void loadForecast(admin);
  void loadGoals(admin);

  const [
    { data: accountsData, error: acctError },
    { data: manualData, error: manualError },
    { data: holdingsData, error: holdingsError },
    { data: pricesData, error: pricesError },
    ledger,
    { accounts: manualCards, error: manualCardsError },
    { data: budgetRows, error: budgetsError },
    { data: snapshotRows, error: snapshotsError },
    { data: itemRows },
    tileOrder,
    mainOrder,
    railOrder,
    monthlyBudget,
    displayName,
    depositReviews,
    subscriptions,
  ] = await Promise.all([
    admin.from("accounts").select("type, current_balance").eq("is_hidden", false),
    admin.from("manual_assets").select("value, is_liability, category"),
    admin.from("precious_metal_holdings").select("metal, weight, weight_unit, purity"),
    admin.from("metal_prices").select("metal, price_per_troy_oz_usd"),
    loadLedger(admin),
    // Shared with the ledger above (same request), so this isn't a second read.
    loadManualAccounts(admin),
    admin.from("budgets").select("id, category, monthly_amount"),
    admin.from("net_worth_snapshots").select("date, net_worth").order("date", { ascending: true }),
    admin.from("items").select("id, institution_name, status, error_code"),
    loadCardOrder(admin, "overview"),
    loadCardOrder(admin, "overview-main"),
    loadCardOrder(admin, "overview-rail"),
    loadMonthlyBudget(admin),
    loadDisplayName(admin),
    loadDepositReviews(admin),
    // New subscriptions, and charges after a cancel, waiting for an answer.
    loadSubscriptions(admin),
  ]);

  if (acctError) console.error("Failed to load accounts for overview", acctError);
  if (manualError) console.error("Failed to load manual assets for overview", manualError);
  if (holdingsError) console.error("Failed to load precious metal holdings for overview", holdingsError);
  if (pricesError) console.error("Failed to load metal prices for overview", pricesError);
  if (budgetsError) console.error("Failed to load budgets for overview", budgetsError);
  if (snapshotsError) console.error("Failed to load net worth history for overview", snapshotsError);

  const now = calendarNow();
  const today = Number(now.isoDate.slice(8, 10));
  const ref = { year: now.year, month: now.month };
  const prev = shiftMonth(ref, -1);
  const monthName = new Date(Date.UTC(ref.year, ref.month, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const previousMonthName = new Date(Date.UTC(prev.year, prev.month, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const spendingError = ledger.error;

  // Net worth, and how it moved over 30 days.
  const netWorthError = Boolean(acctError || manualError || holdingsError || pricesError || manualCardsError);
  const { netWorth } = computeNetWorth(
    [...(accountsData ?? []), ...manualAccountsAsAccounts(manualCards)],
    manualData ?? [],
    totalPreciousMetalsValue(holdingsData ?? [], pricesData ?? [])
  );
  const trend = netWorthTrend(
    (snapshotRows ?? []).map((r) => ({ date: r.date as string, net_worth: Number(r.net_worth) })),
    netWorth,
    now.isoDate
  );

  // Money you can reach today, less what the cards are owed.
  const liquid = liquidCash(
    accountsData ?? [],
    manualCards,
    (manualData ?? []).filter((a) => a.category === "cash" && !a.is_liability)
  );

  // This month: spending net of refunds, the same total Spending and Budgets show.
  const categorySpending = monthCategorySpending(ledger.spending, now.year, now.month);
  const monthTotal = Math.round(categorySpending.reduce((s, c) => s + c.amount, 0) * 100) / 100;
  const budgetList = (budgetRows ?? []).map((b) => ({ id: b.id, category: b.category, monthly_amount: Number(b.monthly_amount) }));
  const plan = budgetPlan(categorySpending, budgetList, monthlyBudget.amount, now);
  const spent = spendingSoFar(ledger.spending, ref, today);
  const income = incomeSoFar(ledger.transactions, ref, today);
  const daily = dailySpending(ledger.spending, ref);
  const where = whereItWent(categorySpending);

  // Each transaction's kind, so the recent ones read as spending, income, a card payment or a transfer.
  const cardIds = new Set(ledger.cards.map((c) => c.id));
  const described = describeTransactions(ledger.transactions, cardIds, ledger.connectedCardIssuers);

  // Deposits that aren't pay or interest, waiting to be told what they were,
  // and the charges one of them could be paying back.
  const toReview = ledger.error || depositReviews.error ? [] : depositsToReview(ledger.transactions, cardIds, depositReviews.reviews, now.isoDate);
  // Only while something's waiting; answered ones are on Transactions → Deposits.
  const charges = toReview.length ? chargeOptions(ledger.transactions, toReview[toReview.length - 1].date, ledger.connectedCardIssuers).slice(0, CHARGES_SENT) : [];

  // The only things the Overview asks you to do: sign in to a bank again, or import a statement.
  const notices = [
    ...(itemRows ?? [])
      .filter((i) => isDisconnected(i))
      .map((i) => ({
        key: `reconnect-${i.id}`,
        text: `${(i.institution_name as string | null) ?? "A bank"} stopped syncing until you sign in again.`,
        href: "/accounts",
        action: "Reconnect",
      })),
    ...manualCards.flatMap((a) => {
      const status = importStatus(a.lastImportedAt, now.isoDate);
      return status?.overdue ? [{ key: `import-${a.id}`, text: `Your ${a.name} statement is ${status.daysSince} days old.`, href: "/accounts", action: "Import it" }] : [];
    }),
  ];

  const m = plan.month;
  const daysLeft = daily.length - today;
  // The categories closest to (or past) their own budgets, for the budget card.
  const watch = budgetProgress(categorySpending, budgetList, now)
    .filter((p) => p.percentUsed >= 0.8)
    .slice(0, 2)
    .map((p) => ({ category: p.category, label: p.label, spent: p.spent, budget: p.budget, percentUsed: p.percentUsed, status: p.status }));
  // Where the month is heading, how last month ended, and a budget that fits recent months.
  const projected = monthEndPace(spent.now, today, daily.length);
  const lastMonthTotal = Math.round(dailySpending(ledger.spending, prev).reduce((s, v) => s + v, 0) * 100) / 100;
  // The three months before this one (spendingByMonth ends on this month, still going).
  const suggestion = spendingError ? null : budgetSuggestion(spendingByMonth(ledger.spending, ref, 4).slice(0, -1).map((mo) => mo.amount), plan.total);
  const incomeMonths = incomeByMonth(ledger.transactions, ref, 6);
  const months = spendingByMonth(ledger.spending, ref, 6).map((mo, i) => ({ month: mo.month, spending: mo.amount, income: incomeMonths[i].amount }));

  // Three headline figures across the top of the main column.
  const tiles: GridCard[] = [
    {
      id: "net-worth-now",
      label: "Net worth",
      node: (
        <StatTile
          label="Net worth"
          href="/accounts"
          value={netWorthError ? "—" : <Amount value={netWorth} />}
          change={movement(trend.changePct, trend.since ? `on ${shortDate(trend.since)}` : "30 days ago")}
          note={
            netWorthError
              ? "Couldn't load net worth."
              : trend.change === null
                ? "Across every account and asset"
                : `${trend.change >= 0 ? "+" : "−"}${whole(Math.abs(trend.change))} ${trend.since ? `since ${shortDate(trend.since)}` : "in 30 days"}`
          }
          shortNote={netWorthError || trend.change === null ? undefined : `${trend.change >= 0 ? "+" : "−"}${whole(Math.abs(trend.change))} ${trend.since ? `since ${shortDate(trend.since)}` : "in 30 days"}`}
        />
      ),
    },
    {
      id: "cash-now",
      label: "Cash after cards",
      node: (
        <StatTile
          label="Cash after cards"
          shortLabel="Cash"
          href="/accounts"
          value={acctError || manualError || manualCardsError ? "—" : <Amount value={liquid.net} />}
          note={
            acctError || manualError || manualCardsError
              ? "Couldn't load your balances."
              : `${whole(liquid.bank + liquid.cash)} in the bank${liquid.cash > 0 ? " and cash" : ""}, ${whole(liquid.cards)} owed on cards`
          }
          shortNote={acctError || manualError || manualCardsError ? undefined : `${whole(liquid.cards)} on cards`}
        />
      ),
    },
    {
      id: "spent-this-month",
      label: `Spent in ${monthName}`,
      node: (
        <StatTile
          label={`Spent in ${monthName}`}
          shortLabel="Spent"
          href="/reports/spending"
          value={spendingError ? "—" : <Amount value={monthTotal} />}
          change={movement(spent.change, `${previousMonthName} at this point`)}
          note={spendingError ? "Couldn't load spending." : `${previousMonthName} by the ${ordinal(today)}: ${whole(spent.before)}`}
          shortNote={spendingError ? undefined : `${previousMonthName.slice(0, 3)}: ${whole(spent.before)}`}
        />
      ),
    },
    {
      id: "income-this-month",
      label: `Income in ${monthName}`,
      node: (
        <StatTile
          label={`Income in ${monthName}`}
          shortLabel="Income"
          href="/reports/income"
          value={spendingError ? "—" : <Amount value={income.now} />}
          change={movement(income.change, `${previousMonthName} at this point`)}
          // Measured the way the chip is: last month through the same day.
          note={spendingError ? "Couldn't load income." : `${previousMonthName} by the ${ordinal(today)}: ${whole(income.before)}`}
          shortNote={spendingError ? undefined : `${previousMonthName.slice(0, 3)}: ${whole(income.before)}`}
        />
      ),
    },
  ];

  // Beneath them, the month's chart and the latest transactions.
  const main: GridCard[] = [
    {
      id: "month-spending",
      label: `Spending in ${monthName}`,
      node: (
        <MonthChart
          monthName={monthName}
          previousMonthName={previousMonthName}
          monthKey={now.isoDate.slice(0, 7)}
          today={today}
          daily={cumulative(daily)}
          lastMonth={cumulative(dailySpending(ledger.spending, prev))}
          budget={plan.total}
          months={months}
          projected={projected}
          lastMonthTotal={lastMonthTotal}
        />
      ),
    },
    {
      id: "recent-activity",
      label: "Recent transactions",
      node: <RecentTransactionsCard rows={ledger.transactions.slice(0, 7)} described={described} error={ledger.error} />,
    },
    {
      id: "goals-progress",
      label: "Goals",
      node: (
        <Suspense fallback={<PanelSkeleton />}>
          <GoalsCard todayIso={now.isoDate} />
        </Suspense>
      ),
    },
  ];

  // Beside them: the month against the budget, what's due, and where the money went.
  const rail: GridCard[] = [
    {
      id: "safe-to-spend",
      label: "Safe to spend",
      node: (
        <Suspense fallback={<PanelSkeleton />}>
          <SafeToSpendCard todayIso={now.isoDate} />
        </Suspense>
      ),
    },
    {
      id: "budget-now",
      label: "Left to spend",
      node: (
        <BudgetCard
          monthName={monthName}
          total={plan.total}
          remaining={m?.remaining ?? 0}
          percentUsed={m?.percentUsed ?? 0}
          status={m?.status ?? "ok"}
          daysLeft={daysLeft}
          watch={watch}
          spent={monthTotal}
          suggestion={suggestion}
        />
      ),
    },
    {
      id: "upcoming-bills",
      label: "Upcoming",
      node: (
        <Suspense fallback={<PanelSkeleton />}>
          <UpcomingCard todayIso={now.isoDate} />
        </Suspense>
      ),
    },
    {
      id: "where-it-went",
      label: "Where it went",
      node: <WhereItWentCard monthName={monthName} top={where.top} rest={where.rest} error={spendingError} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <GreetingHeader name={displayName} />
      <AccountNotices items={notices} />
      <DepositReviewCard deposits={toReview} reviewed={[]} charges={charges} />
      <SubscriptionReviewCard review={subscriptions.review} variant="overview" />
      {/*
        Two columns on a wide screen, each a stack that ends level with the
        other, so rearranging never leaves a hole. On anything narrower, one
        column that leads with what's safe to spend: that card, the headline
        figures, the month's chart, the budget, what's due, where it went,
        the latest transactions and the goals (by position, so a rearranged
        column keeps its own order).
      */}
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          <div className="order-2 min-w-0 xl:order-none">
            <SortableCardGrid page="overview" layout="quad" cards={applyCardOrder(tiles, (c) => c.id, tileOrder, IN_PLACE)} />
          </div>
          <div className="contents xl:block xl:min-w-0 xl:flex-1">
            <SortableCardGrid page="overview-main" layout="column" narrowOrder={[3, 7, 8]} cards={applyCardOrder(main, (c) => c.id, mainOrder, IN_PLACE)} />
          </div>
        </div>
        <div className="contents xl:block xl:min-w-0">
          <SortableCardGrid page="overview-rail" layout="column" narrowOrder={[1, 4, 5, 6, 7]} cards={applyCardOrder(rail, (c) => c.id, railOrder, IN_PLACE)} />
        </div>
      </div>
    </div>
  );
}
