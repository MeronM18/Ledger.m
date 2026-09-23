import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { MerchantRule, TransactionOverride } from "@/lib/transaction-edits";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Loads every per-transaction override and merchant rule for
 * applyEditsToAll(). `error` is true when either read failed so the caller
 * can show its normal error state, rather than silently rendering the
 * unedited Plaid data as if the edits didn't exist.
 */
export async function loadTransactionEdits(admin: AdminClient): Promise<{
  overrides: Map<string, TransactionOverride>;
  rules: MerchantRule[];
  error: boolean;
}> {
  const [overridesRes, rulesRes] = await Promise.all([
    fetchAllRows<TransactionOverride>((from, to) =>
      admin
        .from("transaction_overrides")
        .select("transaction_id, category, merchant_name, notes")
        .order("transaction_id")
        .range(from, to)
    ),
    admin.from("merchant_rules").select("id, match_text, rename_to, category").order("created_at"),
  ]);

  if (overridesRes.error) console.error("Failed to load transaction overrides", overridesRes.error);
  if (rulesRes.error) console.error("Failed to load merchant rules", rulesRes.error);

  return {
    overrides: new Map((overridesRes.data ?? []).map((o) => [o.transaction_id, o])),
    rules: (rulesRes.data ?? []) as MerchantRule[],
    error: Boolean(overridesRes.error || rulesRes.error),
  };
}
