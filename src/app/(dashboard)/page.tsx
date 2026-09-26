import { Suspense } from "react";
import { DepositReviewCard } from "@/components/deposit-review";
import { GreetingHeader } from "@/components/greeting-header";
import { SubscriptionReviewCard } from "@/components/subscription-review";
import { NetWorthCard } from "@/components/overview/net-worth-card";
import { AccountNotices, NextPaymentCard, PanelSkeleton, RecentTransactionsCard, WhereItWentCard } from "@/components/overview/overview-cards";
import { SpendingActivityCard } from "@/components/overview/spending-activity-card";
import { SortableCardGrid, type GridCard } from "@/components/sortable-card-grid";
import { monthCategorySpending } from "@/lib/budgets";
import { applyCardOrder } from "@/lib/card-order";
import { chargeOptions, depositsToReview } from "@/lib/deposit-review";
import { loadForecast } from "@/lib/forecast-data";
import { importStatus } from "@/lib/import-reminders";
import { isDisconnected } from "@/lib/item-status";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { loadNetWorthHistory } from "@/lib/net-worth-history";
import { spendingActivity, whereItWent } from "@/lib/overview";
import { loadSubscriptions } from "@/lib/recurring-extras";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { describeTransactions } from "@/lib/transaction-kind";
import { loadCardOrder, loadDepositReviews, loadDisplayName } from "@/lib/ui-preferences";

export const metadata = { title: "Overview" };

// A card added to the Overview lands where it's designed to sit, even in a layout you've rearranged.
const IN_PLACE = { fresh: "in-place" } as const;

// The newest charges sent along for "paid me back", to pick from or search.
const CHARGES_SENT = 300;
// Rows in the transactions list.
const RECENT_SHOWN = 8;

/**
 * The Overview, kept to the main ideas: net worth and its line, the latest
 * transactions under it, and beside them the next payment, spending by the
 * day, week or month, and where this month's money went. Everything else
 * has its own page; only what needs an answer (a bank to reconnect, a
 * deposit or a subscription to review) sits above it all.
 */
export default async function OverviewPage() {
  const admin = createAdminClient();
  // The Next payment card loads its forecast on its own (in Suspense); starting it now means it's ready sooner.
  void loadForecast(admin);

  const [ledger, history, { accounts: manualCards }, { data: itemRows }, mainOrder, railOrder, displayName, depositReviews, subscriptions] = await Promise.all([
    loadLedger(admin),
    loadNetWorthHistory(admin),
    loadManualAccounts(admin),
    admin.from("items").select("id, institution_name, status, error_code"),
    loadCardOrder(admin, "overview-main"),
    loadCardOrder(admin, "overview-rail"),
    loadDisplayName(admin),
    loadDepositReviews(admin),
    // New subscriptions, and charges after a cancel, waiting for an answer.
    loadSubscriptions(admin),
  ]);

  const now = calendarNow();
  const monthName = new Date(Date.UTC(now.year, now.month, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

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

  // Net worth and the latest transactions, the main column.
  const main: GridCard[] = [
    {
      id: "net-worth-chart",
      label: "Net worth",
      node: <NetWorthCard start={history.start} series={history.series} error={history.error} />,
    },
    {
      id: "recent-activity",
      label: "Recent transactions",
      node: <RecentTransactionsCard rows={ledger.transactions.slice(0, RECENT_SHOWN)} described={described} error={ledger.error} />,
    },
  ];

  // Beside them, small to large: what's due next, spending lately, and where this month's money went.
  const where = whereItWent(monthCategorySpending(ledger.spending, now.year, now.month));
  const rail: GridCard[] = [
    {
      id: "next-payment",
      label: "Next payment",
      node: (
        <Suspense fallback={<PanelSkeleton />}>
          <NextPaymentCard todayIso={now.isoDate} />
        </Suspense>
      ),
    },
    {
      id: "spending-activity",
      label: "Spending",
      node: <SpendingActivityCard activity={spendingActivity(ledger.spending, now.isoDate)} />,
    },
    {
      id: "where-it-went",
      label: "Where it went",
      node: <WhereItWentCard monthName={monthName} all={where.all} top={where.top} rest={where.rest} error={ledger.error} />,
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
        column: net worth, the next payment, spending, the latest
        transactions, then where it went (by position, so a rearranged
        column keeps its own order).
      */}
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="contents xl:block xl:min-w-0">
          <SortableCardGrid page="overview-main" layout="column" narrowOrder={[1, 4]} cards={applyCardOrder(main, (c) => c.id, mainOrder, IN_PLACE)} />
        </div>
        <div className="contents xl:block xl:min-w-0">
          <SortableCardGrid page="overview-rail" layout="column" narrowOrder={[2, 3, 5]} cards={applyCardOrder(rail, (c) => c.id, railOrder, IN_PLACE)} />
        </div>
      </div>
    </div>
  );
}
