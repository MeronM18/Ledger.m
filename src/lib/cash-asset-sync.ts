import "server-only";
import { shiftAssetValues, startAssetValues } from "@/lib/asset-history";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

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
 * transaction is never silently dropped. Its history moves by the same
 * amount from `onDate` (the transaction's day) on, so the net worth line
 * shows cash spent on the day it was spent.
 */
export async function adjustCashAsset(admin: AdminClient, delta: number, onDate?: string | null): Promise<void> {
  if (delta === 0) return;
  const day = onDate && /^\d{4}-\d{2}-\d{2}$/.test(onDate) ? onDate : calendarNow().isoDate;

  const { data: existing, error: fetchError } = await admin
    .from("manual_assets")
    .select("id, value, created_at, updated_at")
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
      return;
    }
    await shiftAssetValues(admin, { ...existing, value: Number(existing.value) }, day, delta);
    return;
  }

  const { data: created, error: insertError } = await admin
    .from("manual_assets")
    .insert({
      name: "Cash",
      category: "cash",
      value: delta,
      is_liability: false,
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("Failed to auto-create Cash manual asset", insertError);
    return;
  }
  await startAssetValues(admin, created.id, day, delta);
}
