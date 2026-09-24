import "server-only";
import { cache } from "react";
import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { MerchantRule, TransactionOverride } from "@/lib/transaction-edits";

type AdminClient = ReturnType<typeof createAdminClient>;

// Postgres "undefined_column", for a column a migration hasn't added yet.
export const UNDEFINED_COLUMN = "42703";

/**
 * Loads every per-transaction override and merchant rule for
 * applyEditsToAll(). `error` is true when either read failed so the caller
 * can show its normal error state, rather than silently rendering the
 * unedited Plaid data as if the edits didn't exist.
 */
export const loadTransactionEdits = cache(async function loadTransactionEdits(admin: AdminClient): Promise<{
  overrides: Map<string, TransactionOverride>;
  rules: MerchantRule[];
  error: boolean;
}> {
  const readOverrides = (withPaidBack: boolean) =>
    fetchAllRows<TransactionOverride>((from, to) =>
      withPaidBack
        ? admin
            .from("transaction_overrides")
            .select("transaction_id, category, merchant_name, notes, reimbursed_amount")
            .order("transaction_id")
            .range(from, to)
        : admin.from("transaction_overrides").select("transaction_id, category, merchant_name, notes").order("transaction_id").range(from, to)
    );
  const [firstTry, rulesRes] = await Promise.all([
    readOverrides(true),
    admin.from("merchant_rules").select("id, match_text, rename_to, category").order("created_at"),
  ]);

  // Before migration 0015 there's no paid-back column: read without it
  // rather than failing every page.
  const overridesRes = firstTry.error?.code === UNDEFINED_COLUMN ? await readOverrides(false) : firstTry;

  if (overridesRes.error) console.error("Failed to load transaction overrides", overridesRes.error);
  if (rulesRes.error) console.error("Failed to load merchant rules", rulesRes.error);

  return {
    overrides: new Map((overridesRes.data ?? []).map((o) => [o.transaction_id, o])),
    rules: (rulesRes.data ?? []) as MerchantRule[],
    error: Boolean(overridesRes.error || rulesRes.error),
  };
});
