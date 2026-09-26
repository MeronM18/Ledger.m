import { RecurringBoard, type StreamRow } from "@/components/recurring-board";
import type { CalendarEvent } from "@/components/subscription-calendar";
import type { ManualSubscription } from "@/components/manual-subscription-form";
import { QueryErrorState } from "@/components/query-error";
import { occurrencesBetween } from "@/lib/forecast";
import { effectiveNextDate, subscriptionInsights, type InsightItem } from "@/lib/subscription-insights";
import { loadFirstChargeAmounts } from "@/lib/subscription-data";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { subscriptionAccount } from "@/lib/subscription-accounts";
import { sameName } from "@/lib/recurring-detection";
import { loadRecurringExtras } from "@/lib/recurring-extras";
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

  // Started now, used further down: they don't depend on the streams, so
  // they load alongside them instead of after.
  const importedPromise = Promise.all([
    fetchAllRows<{ id: string; date: string; name: string; amount: number; pfc_primary: string; manual_account_id: string | null }>((from, to) =>
      admin
        .from("manual_transactions")
        .select("id, date, name, amount, pfc_primary, manual_account_id")
        .eq("source", "apple_card_csv")
        .order("date")
        .order("id")
        .range(from, to)
    ),
    loadManualAccounts(admin),
    loadRecurringExtras(admin),
  ]);

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

  const [importedRes, manualAccounts, { found, installments }] = await importedPromise;

  if (importedRes.error) console.error("Failed to load imported card transactions", importedRes.error);

  // A subscription you added that's charged to an imported card (Apple Card)
  // belongs to that card: found by its name among the card's charges, or by
  // the note left when it was added from them.
  const importedCards = manualAccounts.accounts.filter((a) => a.type === "credit").map((a) => ({ id: `manual:${a.id}`, name: a.name }));
  const importedCharges = (importedRes.data ?? []).map((t) => ({ name: t.name, accountId: t.manual_account_id ? `manual:${t.manual_account_id}` : null }));
  const manualWithCards: ManualSubscription[] = manualSubscriptions.map((m) => ({
    ...m,
    foundOn: subscriptionAccount({ name: m.name, notes: m.notes }, importedCharges, importedCards),
  }));
  // Recurring charges found in every account that the bank's feed missed.
  const todayIso = calendarNow().isoDate;
  const activeFound = found.filter((f) => f.active);
  // The bank's copy of one that stopped there but goes on elsewhere (moved
  // to another card, or restarted) is the same subscription: the found one stands for it.
  const shownStreams = streams.filter((s) => s.is_active || s.user_marked_cancelled || !activeFound.some((f) => sameName(f.name, streamName(s))));

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
      ...activeFound.map((f) => ({
        key: `found-${f.key}`,
        name: f.name,
        source: "found" as const,
        amount: f.amount,
        frequency: f.frequency,
      })),
    ] satisfies InsightItem[],
    "USD"
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
    ...activeFound.map((f) => ({
      id: `found-${f.key}`,
      name: f.name,
      amount: f.amount,
      frequency: f.frequency as string | null,
      date: f.nextDate,
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
      streams={shownStreams}
      found={found}
      manualSubscriptions={manualWithCards}
      accounts={accountRows.map((a) => ({ id: a.id, name: a.name, mask: a.mask }))}
      insights={insights}
      calendarEvents={calendarEvents}
      installments={installments}
      todayIso={todayIso}
    />
  );
}
