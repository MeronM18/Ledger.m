import { Suspense } from "react";
import { GreetingHeader } from "@/components/greeting-header";
import { MonthChart } from "@/components/overview/month-chart";
import { AccountNotices, PanelSkeleton, RecentTransactionsCard, UpcomingCard, WhereItWentCard } from "@/components/overview/overview-cards";
import { StatTile, type TileChange } from "@/components/overview/stat-tile";
import { SortableCardGrid, type GridCard } from "@/components/sortable-card-grid";
import { budgetPlan, monthCategorySpending } from "@/lib/budgets";
import { applyCardOrder } from "@/lib/card-order";
import { importStatus } from "@/lib/import-reminders";
import { isDisconnected } from "@/lib/item-status";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { computeNetWorth, manualAccountsAsAccounts } from "@/lib/net-worth";
import { netWorthTrend } from "@/lib/net-worth-trend";
import {
  cumulative,
  dailySpending,
  incomeByMonth,
  incomeSoFar,
  pillLevels,
  pillLevelsInRange,
  shiftMonth,
  spendingByMonth,
  spendingSoFar,
  whereItWent,
} from "@/lib/overview";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { describeTransactions } from "@/lib/transaction-kind";
import { loadCardOrder, loadDisplayName, loadMonthlyBudget } from "@/lib/ui-preferences";

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

// Pills for "left to spend": the monthly budget in equal steps, lit for what's left of it.
const BUDGET_PILLS = 24;
// The site's own tones: budget status as on Budgets (moss, champagne, oxblood),
// spending in champagne as on Spending, income in moss as on Reports → Income,
// and net worth in champagne as its line on Accounts.
const STATUS_COLOR = { ok: "var(--moss)", warning: "var(--champagne)", over: "var(--oxblood)" } as const;
const SPENT_COLOR = "var(--champagne)";
const INCOME_COLOR = "var(--moss)";
const WORTH_COLOR = "var(--champagne)";

export default async function OverviewPage() {
  const admin = createAdminClient();

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
    savedOrder,
    monthlyBudget,
    displayName,
  ] = await Promise.all([
    admin.from("accounts").select("type, current_balance").eq("is_hidden", false),
    admin.from("manual_assets").select("value, is_liability"),
    admin.from("precious_metal_holdings").select("metal, weight, weight_unit, purity"),
    admin.from("metal_prices").select("metal, price_per_troy_oz_usd"),
    loadLedger(admin),
    // Shared with the ledger above (same request), so this isn't a second read.
    loadManualAccounts(admin),
    admin.from("budgets").select("id, category, monthly_amount"),
    admin.from("net_worth_snapshots").select("date, net_worth").order("date", { ascending: true }),
    admin.from("items").select("id, institution_name, status, error_code"),
    loadCardOrder(admin, "overview"),
    loadMonthlyBudget(admin),
    loadDisplayName(admin),
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
  const described = describeTransactions(ledger.transactions, new Set(ledger.cards.map((c) => c.id)), ledger.connectedCardIssuers);

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
  const leftShare = m ? Math.max(0, 1 - m.percentUsed) : 0;

  const cards: GridCard[] = [
    {
      id: "left-to-spend",
      label: "Left to spend",
      span: "quarter",
      node:
        m && plan.total !== null ? (
          <StatTile
            label="Left to spend"
            href="/budgets"
            value={<Amount value={m.remaining} />}
            change={
              m.status === "over"
                ? { text: "Over", direction: null, tone: "bad", label: "Over budget" }
                : { text: `${Math.round(leftShare * 100)}% left`, direction: null, tone: "quiet", label: `${Math.round(leftShare * 100)}% of the budget left` }
            }
            note={
              m.remaining < 0
                ? `Over your ${whole(plan.total)} budget`
                : `of ${whole(plan.total)}${daysLeft > 0 ? ` · about ${whole(m.remaining / daysLeft)} a day for ${daysLeft} ${daysLeft === 1 ? "day" : "days"}` : ""}`
            }
            shortNote={m.remaining < 0 ? `Over ${whole(plan.total)}` : `of ${whole(plan.total)}${daysLeft > 0 ? ` · ${whole(m.remaining / daysLeft)}/day` : ""}`}
            // Lit for what's left, so the bright part is the figure; over budget, all of it in red.
            levels={Array.from({ length: BUDGET_PILLS }, (_, i) => (m.status === "over" || i < Math.round(leftShare * BUDGET_PILLS) ? 1 : null))}
            color={STATUS_COLOR[m.status]}
          />
        ) : (
          <StatTile
            label="Left to spend"
            href="/budgets"
            value="No budget"
            note="Set a monthly budget on Budgets to see what's left."
            shortNote="Set one on Budgets"
            levels={new Array(BUDGET_PILLS).fill(null)}
            color={STATUS_COLOR.ok}
          />
        ),
    },
    {
      id: "spent-this-month",
      label: `Spent in ${monthName}`,
      span: "quarter",
      node: (
        <StatTile
          label={`Spent in ${monthName}`}
          shortLabel="Spent"
          href="/reports/spending"
          value={spendingError ? "—" : <Amount value={monthTotal} />}
          change={movement(spent.change, `${previousMonthName} at this point`)}
          note={spendingError ? "Couldn't load spending." : `${previousMonthName} by the ${ordinal(today)}: ${whole(spent.before)}`}
          shortNote={spendingError ? undefined : `${previousMonthName.slice(0, 3)}: ${whole(spent.before)}`}
          levels={pillLevels(daily.map((v, i) => (i < today ? v : null)))}
          color={SPENT_COLOR}
        />
      ),
    },
    {
      id: "income-this-month",
      label: `Income in ${monthName}`,
      span: "quarter",
      node: (
        <StatTile
          label={`Income in ${monthName}`}
          shortLabel="Income"
          href="/reports/income"
          value={spendingError ? "—" : <Amount value={income.now} />}
          change={movement(income.change, `${previousMonthName} at this point`)}
          note={spendingError ? "Couldn't load income." : `${previousMonthName}: ${whole(income.beforeTotal)} in all`}
          shortNote={spendingError ? undefined : `${previousMonthName.slice(0, 3)}: ${whole(income.beforeTotal)}`}
          levels={pillLevels(incomeByMonth(ledger.transactions, ref, 12).map((mo) => mo.amount))}
          color={INCOME_COLOR}
        />
      ),
    },
    {
      id: "net-worth-now",
      label: "Net worth",
      span: "quarter",
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
          shortNote={netWorthError || trend.change === null ? undefined : `${trend.change >= 0 ? "+" : "−"}${whole(Math.abs(trend.change))}`}
          levels={pillLevelsInRange(trend.values.slice(-30))}
          color={WORTH_COLOR}
        />
      ),
    },
    {
      id: "month-spending",
      label: `Spending in ${monthName}`,
      span: "wide",
      node: (
        <MonthChart
          monthName={monthName}
          previousMonthName={previousMonthName}
          monthKey={now.isoDate.slice(0, 7)}
          today={today}
          daily={cumulative(daily)}
          lastMonth={cumulative(dailySpending(ledger.spending, prev))}
          budget={plan.total}
          months={spendingByMonth(ledger.spending, ref, 6)}
        />
      ),
    },
    {
      id: "upcoming-bills",
      label: "Upcoming",
      span: "side",
      node: (
        <Suspense fallback={<PanelSkeleton />}>
          <UpcomingCard todayIso={now.isoDate} />
        </Suspense>
      ),
    },
    {
      id: "where-it-went",
      label: "Where it went",
      span: "side",
      node: <WhereItWentCard monthName={monthName} top={where.top} rest={where.rest} error={spendingError} />,
    },
    {
      id: "recent-activity",
      label: "Recent transactions",
      span: "full",
      node: <RecentTransactionsCard rows={ledger.transactions.slice(0, 7)} described={described} error={ledger.error} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <GreetingHeader name={displayName} />
      <AccountNotices items={notices} />
      <SortableCardGrid page="overview" cards={applyCardOrder(cards, (c) => c.id, savedOrder)} />
    </div>
  );
}
