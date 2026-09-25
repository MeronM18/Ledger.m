import { RecurringBoard, type StreamRow } from "@/components/recurring-board";
import type { CalendarEvent } from "@/components/subscription-calendar";
import type { ManualSubscription } from "@/components/manual-subscription-form";
import { QueryErrorState } from "@/components/query-error";
import { occurrencesBetween } from "@/lib/forecast";
import { effectiveNextDate, subscriptionInsights, type InsightItem } from "@/lib/subscription-insights";
import { loadFirstChargeAmounts } from "@/lib/subscription-data";
import { detectRecurring, newDetections } from "@/lib/recurring-detection";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamDisplayName } from "@/lib/transaction-display";
import { calendarNow, easternToday } from "@/lib/time";

// How far ahead the renewal calendar looks: about three months of days.
const CALENDAR_DAYS = 92;

type StreamQueryRow = Omit<StreamRow, "firstChargeAmount" | "institution" | "logoUrl" | "lastCharge" | "previousCharge"> & {
  transaction_ids: string[] | null;
};

export const metadata = { title: "Recurring" };

export default async function SubscriptionsPage() {
  const admin = createAdminClient();

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

  const streamName = (s: StreamRow) => streamDisplayName(s);
  const activeStreams = streams.filter((s) => s.is_active && !s.user_marked_cancelled);
  const activeManual = manualSubscriptions.filter((m) => m.is_active);

  const insights = subscriptionInsights(
    [
      ...activeStreams.map((s) => ({
        key: `plaid-${s.id}`,
        name: streamName(s),
        source: "plaid" as const,
        amount: s.average_amount ?? 0,
        frequency: s.frequency,
        categoryDetailed: s.pfc_detailed,
      })),
      ...activeManual.map((m) => ({
        key: `manual-${m.id}`,
        name: m.name,
        source: "manual" as const,
        amount: m.amount,
        frequency: m.frequency,
      })),
    ] satisfies InsightItem[],
    "USD"
  );

  // Recurring charges hiding in imported Apple Card transactions, minus
  // anything already tracked. A failed read just means no suggestions.
  const importedRes = await fetchAllRows<{ date: string; name: string; amount: number; pfc_primary: string }>((from, to) =>
    admin
      .from("manual_transactions")
      .select("date, name, amount, pfc_primary")
      .eq("source", "apple_card_csv")
      .order("date")
      .order("id")
      .range(from, to)
  );
  if (importedRes.error) console.error("Failed to load imported card transactions", importedRes.error);
  const suggestions = newDetections(
    detectRecurring(
      (importedRes.data ?? [])
        .filter((t) => !t.pfc_primary.startsWith("TRANSFER"))
        .map((t) => ({ date: t.date, name: t.name, amount: Number(t.amount) }))
    ),
    [...activeStreams.map(streamName), ...manualSubscriptions.map((m) => m.name)]
  );

  const today = easternToday();
  const end = new Date(today.getTime() + CALENDAR_DAYS * 86_400_000);
  const calendarEvents: CalendarEvent[] = [
    ...activeStreams.map((s) => ({
      id: `plaid-${s.id}`,
      name: streamName(s),
      amount: s.average_amount ?? 0,
      frequency: s.frequency,
      date: effectiveNextDate(s.predicted_next_date, s.last_date, s.frequency),
    })),
    ...activeManual.map((m) => ({
      id: `manual-${m.id}`,
      name: m.name,
      amount: m.amount,
      frequency: m.frequency as string | null,
      date: m.next_billing_date,
    })),
  ]
    .filter((i) => i.amount > 0)
    .flatMap((item) =>
      occurrencesBetween(item, today, end).map((date) => ({ key: item.id, date, name: item.name, amount: item.amount }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));

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
      streams={streams}
      manualSubscriptions={manualSubscriptions}
      accounts={accountRows.map((a) => ({ id: a.id, name: a.name, mask: a.mask }))}
      insights={insights}
      suggestions={suggestions}
      calendarEvents={calendarEvents}
      todayIso={calendarNow().isoDate}
    />
  );
}
