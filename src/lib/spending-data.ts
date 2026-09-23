import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  filterSpendingTransactions,
  manualTransactionToSpendingTransaction,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";
import { applyEditsToAll } from "@/lib/transaction-edits";
import { loadTransactionEdits } from "@/lib/transaction-edits-server";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The one server-side loader for "every transaction, ready to aggregate":
 * Plaid (paged) + manual, with the user's edits and rules applied, plus the
 * spending-only view (transfers/income/pending removed, unconnected-card
 * payments carved back in). Built for the pages added after the original
 * overview/spending/transactions trio so new features share one load path
 * instead of each re-deriving it.
 */
export async function loadSpendingData(admin: AdminClient): Promise<{
  all: SpendingTransaction[];
  spending: SpendingTransaction[];
  currency: string;
  error: boolean;
}> {
  const [txRes, manualRes, creditRes, edits] = await Promise.all([
    fetchAllRows<SpendingTransaction & { id: string; iso_currency_code: string | null }>((from, to) =>
      admin
        .from("transactions")
        .select("id, date, amount, pfc_primary, pfc_detailed, merchant_name, name, pending, iso_currency_code")
        .order("date", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    admin.from("manual_transactions").select("date, name, amount, pfc_primary"),
    admin.from("accounts").select("item:items(institution_name)").eq("type", "credit"),
    loadTransactionEdits(admin),
  ]);

  if (txRes.error) console.error("Failed to load transactions", txRes.error);
  if (manualRes.error) console.error("Failed to load manual transactions", manualRes.error);
  if (creditRes.error) console.error("Failed to load connected credit accounts", creditRes.error);

  const plaid = applyEditsToAll(txRes.data ?? [], edits.overrides, edits.rules);
  const all: SpendingTransaction[] = [
    ...plaid,
    ...(manualRes.data ?? []).map(manualTransactionToSpendingTransaction),
  ];

  // Only institutions with a connected *credit*-type account count as a
  // connected card (see filterSpendingTransactions / isPaymentToUnconnectedCard).
  const connectedCardIssuers = Array.from(
    new Set(
      (creditRes.data ?? [])
        .map((a) => (a.item as unknown as { institution_name: string | null } | null)?.institution_name)
        .filter((name): name is string => Boolean(name))
    )
  );

  return {
    all,
    spending: filterSpendingTransactions(all, connectedCardIssuers),
    currency: txRes.data?.[0]?.iso_currency_code ?? "USD",
    error: Boolean(txRes.error || manualRes.error || creditRes.error || edits.error),
  };
}
