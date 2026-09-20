import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// manual_transactions.payment_method is free text ("Cash", "Check", "Venmo",
// ...), not a fixed enum — match loosely (trim + case-insensitive) rather
// than requiring an exact "Cash" from the input field.
export function isCashPaymentMethod(paymentMethod: string | null | undefined): boolean {
  return (paymentMethod ?? "").trim().toLowerCase() === "cash";
}

// manual_transactions.amount follows the Plaid convention: positive = money
// out, negative = money in. A manual_assets value is a plain balance, so
// spending cash lowers it and receiving cash raises it — the inverse sign.
export function cashDeltaForTransaction(
  amount: number,
  paymentMethod: string | null | undefined
): number {
  return isCashPaymentMethod(paymentMethod) ? -amount : 0;
}

/**
 * Applies a direct incremental adjustment to the single "Cash" manual asset
 * (category "cash", name "Cash") — a running balance nudged at write-time,
 * never recomputed from scratch by summing cash transactions (that would
 * double-count against this same path). If no Cash asset exists yet, one is
 * created starting from this adjustment, so the first logged cash
 * transaction is never silently dropped.
 */
export async function adjustCashAsset(admin: AdminClient, delta: number): Promise<void> {
  if (delta === 0) return;

  const { data: existing, error: fetchError } = await admin
    .from("manual_assets")
    .select("id, value")
    .eq("category", "cash")
    .ilike("name", "cash")
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to look up Cash manual asset for balance sync", fetchError);
    return;
  }

  if (existing) {
    const { error: updateError } = await admin
      .from("manual_assets")
      .update({ value: existing.value + delta })
      .eq("id", existing.id);
    if (updateError) {
      console.error("Failed to adjust Cash manual asset balance", updateError);
    }
    return;
  }

  const { error: insertError } = await admin.from("manual_assets").insert({
    name: "Cash",
    category: "cash",
    value: delta,
    is_liability: false,
  });
  if (insertError) {
    console.error("Failed to auto-create Cash manual asset", insertError);
  }
}
