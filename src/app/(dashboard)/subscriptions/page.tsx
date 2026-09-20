import { SubscriptionsExplorer, type StreamRow } from "@/components/subscriptions-explorer";
import type { ManualSubscription } from "@/components/manual-subscription-form";
import { QueryErrorState } from "@/components/query-error";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SubscriptionsPage() {
  const admin = createAdminClient();

  // Only outflow streams: inflow streams (payroll, interest credits) are
  // money coming in, not subscriptions someone would want to cancel.
  const [{ data, error }, { data: manualData, error: manualError }, { data: accounts, error: acctError }] =
    await Promise.all([
      admin
        .from("recurring_streams")
        .select(
          "id, description, merchant_name, frequency, average_amount, last_date, predicted_next_date, is_active, user_marked_cancelled, account:accounts(id, name, mask)"
        )
        .eq("direction", "outflow"),
      admin
        .from("manual_subscriptions")
        .select("id, name, amount, frequency, next_billing_date, notes, is_active")
        .order("created_at", { ascending: false }),
      admin.from("accounts").select("id, name, mask").order("name"),
    ]);

  if (error) console.error("Failed to load recurring streams", error);
  if (manualError) console.error("Failed to load manual subscriptions", manualError);
  if (acctError) console.error("Failed to load accounts for subscriptions page", acctError);

  const streams = (data ?? []) as unknown as StreamRow[];
  const manualSubscriptions = (manualData ?? []) as ManualSubscription[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Subscriptions</h1>
      {error || manualError || acctError ? (
        <QueryErrorState message="Couldn't load your subscriptions. Try refreshing the page." />
      ) : (
        <SubscriptionsExplorer
          streams={streams}
          manualSubscriptions={manualSubscriptions}
          accounts={accounts ?? []}
        />
      )}
    </div>
  );
}
