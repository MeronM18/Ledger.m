import { RecurringBoard, type StreamRow } from "@/components/recurring-board";
import type { CalendarEvent } from "@/components/subscription-calendar";
import type { ManualSubscription } from "@/components/manual-subscription-form";
import { QueryErrorState } from "@/components/query-error";
import { occurrencesBetween } from "@/lib/forecast";
import { installmentPaymentLabel, installmentPaymentsBetween } from "@/lib/installments";
import { subscriptionInsights, type InsightItem } from "@/lib/subscription-insights";
import { loadFirstChargeAmounts } from "@/lib/subscription-data";
import { subscriptionAccount } from "@/lib/subscription-accounts";
import { loadSubscriptions } from "@/lib/recurring-extras";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { humanizeTransactionName } from "@/lib/transaction-display";
import { calendarNow, easternToday } from "@/lib/time";

// How far ahead the renewal calendar looks: about three months of days.
const CALENDAR_DAYS = 92;

type StreamQueryRow = Omit<StreamRow, "firstChargeAmount" | "institution" | "logoUrl" | "lastCharge" | "previousCharge"> & {
  transaction_ids: string[] | null;
};

export const metadata = { title: "Recurring" };

export default async function SubscriptionsPage() {
  const admin = createAdminClient();

  // Started now, used further down: they don't depend on the streams, so
  // they load alongside them instead of after.
  const extrasPromise = Promise.all([loadSubscriptions(admin), loadLedger(admin)]);

  // Only outflow streams: inflow streams (payroll, interest credits) are
  // money coming in, not subscriptions someone would want to cancel.
  const [{ data, error }, { data: manualData, error: manualError }, { data: accounts, error: acctError }] =
    await Promise.all([
      admin
        .from("recurring_streams")
        .select(
          "id, description, merchant_name, frequency, average_amount, last_amount, first_date, last_date, predicted_next_date, is_active, user_marked_cancelled, pfc_primary, pfc_detailed, transaction_ids, account:accounts(id, name, mask)"
        )
        .eq("direction", "outflow"),
      admin
        .from("manual_subscriptions")
        .select("id, name, amount, frequency, next_billing_date, notes, is_active")
        .order("created_at", { ascending: false }),
      admin.from("accounts").select("id, name, mask, item:items(institution_name)").order("name"),
    ]);

  if (error) console.error("Failed to load recurring streams", error);
  if (manualError) console.error("Failed to load manual subscriptions", manualError);
  if (acctError) console.error("Failed to load accounts for subscriptions page", acctError);

  const rawStreams = (data ?? []) as unknown as StreamQueryRow[];
  const manualSubscriptions = (manualData ?? []) as ManualSubscription[];

  // Trial detection is a bonus: if it can't load, the page still works
  // without it (loadFirstChargeAmounts logs the failure).
  const { amounts: firstCharges, logos, recent } = await loadFirstChargeAmounts(
    admin,
    rawStreams.map((s) => ({ id: s.id, transaction_ids: s.transaction_ids }))
  );
  const accountRows = (accounts ?? []) as unknown as {
    id: string;
    name: string;
    mask: string | null;
    item: { institution_name: string | null } | null;
  }[];
  const institutionByAccount = new Map(accountRows.map((a) => [a.id, a.item?.institution_name ?? null]));
  // Drop the raw transaction id lists before handing rows to the client
  // component; they're only needed for the first-charge lookup above.
  const streams: StreamRow[] = rawStreams.map((s) => ({
    id: s.id,
    description: s.description,
    merchant_name: s.merchant_name,
    frequency: s.frequency,
    average_amount: s.average_amount,
    last_amount: s.last_amount,
    first_date: s.first_date,
    last_date: s.last_date,
    predicted_next_date: s.predicted_next_date,
    is_active: s.is_active,
    user_marked_cancelled: s.user_marked_cancelled,
    pfc_primary: s.pfc_primary,
    pfc_detailed: s.pfc_detailed,
    account: s.account,
    institution: s.account ? (institutionByAccount.get(s.account.id) ?? null) : null,
    logoUrl: logos.get(s.id) ?? null,
    firstChargeAmount: firstCharges.get(s.id) ?? null,
    lastCharge: recent.get(s.id)?.last ?? null,
    previousCharge: recent.get(s.id)?.previous ?? null,
  }));

  // Every subscription reconciled into one list (subscription-review.ts):
  // a copy another source stands for is left out, so nothing's listed or
  // counted twice, and totals, the calendar and insights all count the same ones.
  const [subscriptions, ledger] = await extrasPromise;
  const { covered, tracked } = subscriptions;
  const shownStreams = streams.filter((s) => !covered[`plaid-${s.id}`]);
  const shownFound = subscriptions.found.filter((f) => !covered[`found-${f.key}`]);

  // A subscription you added belongs to the card its charges land on.
  const cards = ledger.accounts.map((a) => ({ id: a.id, name: a.name }));
  const named = ledger.transactions.filter((t) => t.amount > 0).map((t) => ({ name: humanizeTransactionName(t), accountId: t.account?.id ?? null }));
  const manualWithCards: ManualSubscription[] = manualSubscriptions
    .filter((m) => !covered[`manual-${m.id}`])
    .map((m) => ({ ...m, foundOn: subscriptionAccount({ name: m.name, notes: m.notes }, named, cards) }));

  const detailed = new Map(streams.map((s) => [`plaid-${s.id}`, s.pfc_detailed]));
  const insights = subscriptionInsights(
    tracked.map((t) => ({ key: t.key, name: t.name, source: t.source, amount: t.amount, frequency: t.frequency, categoryDetailed: detailed.get(t.key) ?? null })) satisfies InsightItem[],
    "USD"
  );

  const todayIso = calendarNow().isoDate;
  const today = easternToday();
  const end = new Date(today.getTime() + CALENDAR_DAYS * 86_400_000);
  const calendarEvents: CalendarEvent[] = [
    ...tracked.flatMap((item) => occurrencesBetween({ ...item, id: item.key }, today, end).map((date) => ({ key: item.key, date, name: item.name, amount: item.amount }))),
    // Each installment payment still to make; a plan paid off (or hidden) has none.
    ...installmentPaymentsBetween(subscriptions.installments, todayIso, new Intl.DateTimeFormat("en-CA").format(end)).map((d) => ({
      key: `installment:${d.plan.key}`,
      date: d.payment.date,
      name: installmentPaymentLabel(d),
      amount: d.payment.amount,
      installment: true,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (error || manualError || acctError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Recurring</h1>
        <QueryErrorState message="Couldn't load your subscriptions. Try refreshing the page." />
      </div>
    );
  }

  return (
    <RecurringBoard
      streams={shownStreams}
      found={shownFound}
      manualSubscriptions={manualWithCards}
      covers={subscriptions.covers}
      cancellations={subscriptions.cancellations}
      review={subscriptions.review}
      accounts={accountRows.map((a) => ({ id: a.id, name: a.name, mask: a.mask }))}
      insights={insights}
      calendarEvents={calendarEvents}
      installments={subscriptions.installments}
      todayIso={todayIso}
    />
  );
}
