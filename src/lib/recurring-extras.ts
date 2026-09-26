import "server-only";
import { cache } from "react";
import { foundRecurring, type FoundRow } from "@/lib/found-recurring";
import { buildInstallmentPlans, installmentChargeIds, type InstallmentCharge, type InstallmentPlan } from "@/lib/installments";
import { detectRecurring } from "@/lib/recurring-detection";
import { loadLedger } from "@/lib/spending-data";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { effectiveCategory, humanizeTransactionName, streamDisplayName } from "@/lib/transaction-display";
import { loadFoundRecurring, loadInstallmentPrefs } from "@/lib/ui-preferences";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * What the bank's recurring feed and your own list don't cover, worked out
 * from every charge: installment plans, and recurring charges found in your
 * transactions (one that moved cards, restarted, or is on an imported card).
 * Shared by the Recurring page and the cash flow forecast. A failed read
 * means nothing extra, never a broken page.
 */
export const loadRecurringExtras = cache(async function loadRecurringExtras(
  admin: AdminClient
): Promise<{ found: FoundRow[]; installments: InstallmentPlan[] }> {
  const [ledger, { prefs: installmentPrefs }, { prefs: foundPrefs }, streamsRes, manualRes, accountsRes] = await Promise.all([
    loadLedger(admin),
    loadInstallmentPrefs(admin),
    loadFoundRecurring(admin),
    admin.from("recurring_streams").select("merchant_name, description, is_active, user_marked_cancelled, last_date").eq("direction", "outflow"),
    admin.from("manual_subscriptions").select("name, is_active"),
    admin.from("accounts").select("id, item:items(institution_name)"),
  ]);
  if (streamsRes.error || manualRes.error) {
    console.error("Failed to load what's tracked, so nothing extra is found", streamsRes.error ?? manualRes.error);
  }
  const todayIso = calendarNow().isoDate;

  // Purchases paid off month by month (Apple Card Monthly Installments are
  // noted as such when imported).
  const installmentCharges: InstallmentCharge[] = ledger.transactions
    .filter((t) => t.amount > 0 && !t.pending && !(effectiveCategory(t) ?? "").startsWith("TRANSFER") && t.pfc_detailed !== "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")
    .map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      name: t.name ?? t.merchant_name ?? "",
      note: t.manualSource?.notes ?? t.notes ?? null,
      accountId: t.account?.id ?? null,
      accountName: t.account?.name ?? null,
    }));
  const installments = buildInstallmentPlans(installmentCharges, installmentPrefs, todayIso);
  if (streamsRes.error || manualRes.error) return { found: [], installments };

  // An installment isn't a subscription to cancel.
  const inPlans = installmentChargeIds(installments);
  const detected = detectRecurring(
    ledger.transactions
      .filter((t) => !t.pending && t.amount !== 0 && !inPlans.has(t.id) && t.pfc_detailed !== "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")
      .map((t) => ({
        id: t.id,
        date: t.date,
        name: humanizeTransactionName(t),
        amount: t.amount,
        accountId: t.account?.id ?? null,
        accountName: t.account?.name ?? null,
        category: effectiveCategory(t),
      })),
    todayIso
  );

  const streams = streamsRes.data ?? [];
  const manual = manualRes.data ?? [];
  const institutions = new Map(
    ((accountsRes.data ?? []) as unknown as { id: string; item: { institution_name: string | null } | null }[]).map((a) => [a.id, a.item?.institution_name ?? null])
  );
  const found = foundRecurring(detected, {
    tracked: [
      ...streams.filter((s) => s.is_active && !s.user_marked_cancelled).map((s) => streamDisplayName(s)),
      ...manual.filter((m) => m.is_active).map((m) => m.name as string),
    ],
    cancelledElsewhere: [
      ...streams.filter((s) => s.user_marked_cancelled).map((s) => ({ name: streamDisplayName(s), lastDate: (s.last_date as string | null) ?? null })),
      ...manual.filter((m) => !m.is_active).map((m) => ({ name: m.name as string, lastDate: null })),
    ],
    prefs: foundPrefs,
    todayIso,
    institutionOf: (id) => (id?.startsWith("manual:") ? "Apple Card" : id ? (institutions.get(id) ?? null) : null),
  });
  return { found, installments };
});
