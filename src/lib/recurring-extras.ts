import "server-only";
import { cache } from "react";
import { foundRecurring, type FoundRow } from "@/lib/found-recurring";
import { buildInstallmentPlans, installmentChargeIds, type InstallmentCharge, type InstallmentPlan } from "@/lib/installments";
import { detectRecurring } from "@/lib/recurring-detection";
import { loadLedger } from "@/lib/spending-data";
import { effectiveNextDate } from "@/lib/subscription-insights";
import {
  reconcileSubscriptions,
  type ChargedAfterCancel,
  type EntryInput,
  type NewSubscription,
  type ReviewCharge,
  type Source,
} from "@/lib/subscription-review";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { effectiveCategory, humanizeTransactionName, streamDisplayName } from "@/lib/transaction-display";
import { loadFoundRecurring, loadInstallmentPrefs, loadSubscriptionReview } from "@/lib/ui-preferences";

type AdminClient = ReturnType<typeof createAdminClient>;

/** One subscription that's going, counted once: for totals, the forecast and renewal alerts. */
export type TrackedSubscription = { key: string; source: Source; name: string; amount: number; frequency: string | null; date: string | null };

export type Subscriptions = {
  found: FoundRow[];
  installments: InstallmentPlan[];
  // Entry key → the entry that stands for it (covered ones aren't listed or counted).
  covered: Record<string, string>;
  // Entry key → the manual entries it stands for.
  covers: Record<string, string[]>;
  // Entry key → the day you cancelled it.
  cancellations: Record<string, string>;
  tracked: TrackedSubscription[];
  review: { newSubscriptions: NewSubscription[]; afterCancel: ChargedAfterCancel[]; toConfirm: FoundRow[] };
  error: boolean;
};

const EMPTY_REVIEW = { newSubscriptions: [], afterCancel: [], toConfirm: [] };

/**
 * Every subscription from every source, reconciled into one list
 * (subscription-review.ts), plus installment plans and what's waiting for
 * you to review. Shared by the Recurring page, the Overview, the cash flow
 * forecast and the alerts, so they all agree. A failed read leaves out
 * what depends on it, never breaks a page.
 */
export const loadSubscriptions = cache(async function loadSubscriptions(admin: AdminClient): Promise<Subscriptions> {
  const [ledger, { prefs: installmentPrefs }, { prefs: foundPrefs }, review, streamsRes, manualRes, accountsRes] = await Promise.all([
    loadLedger(admin),
    loadInstallmentPrefs(admin),
    loadFoundRecurring(admin),
    loadSubscriptionReview(admin),
    admin
      .from("recurring_streams")
      .select("id, merchant_name, description, average_amount, last_amount, frequency, predicted_next_date, last_date, is_active, user_marked_cancelled, pfc_detailed")
      .eq("direction", "outflow"),
    admin.from("manual_subscriptions").select("id, name, amount, frequency, next_billing_date, is_active"),
    admin.from("accounts").select("id, item:items(institution_name)"),
  ]);
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

  const failed = Boolean(ledger.error || streamsRes.error || manualRes.error || review.error);
  if (streamsRes.error || manualRes.error) console.error("Failed to load subscriptions", streamsRes.error ?? manualRes.error);
  if (failed) {
    return { found: [], installments, covered: {}, covers: {}, cancellations: {}, tracked: [], review: EMPTY_REVIEW, error: true };
  }

  // Every charge but installments and card payments, pending ones too (a
  // first charge or one after a cancel is flagged the day it shows up).
  const inPlans = installmentChargeIds(installments);
  const charges: ReviewCharge[] = ledger.transactions
    .filter((t) => t.amount !== 0 && !inPlans.has(t.id) && t.pfc_detailed !== "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")
    .map((t) => ({
      id: t.id,
      date: t.date,
      name: humanizeTransactionName(t),
      raw: t.name,
      amount: t.amount,
      pending: t.pending,
      accountId: t.account?.id ?? null,
      accountName: t.account?.name ?? null,
      category: effectiveCategory(t),
    }));

  const cancellations = review.prefs.cancellations;
  const institutions = new Map(
    ((accountsRes.data ?? []) as unknown as { id: string; item: { institution_name: string | null } | null }[]).map((a) => [a.id, a.item?.institution_name ?? null])
  );
  const found = foundRecurring(
    detectRecurring(
      charges.filter((c) => !c.pending),
      todayIso
    ),
    {
      prefs: foundPrefs,
      cancelledOn: (key) => cancellations[`found-${key}`] ?? null,
      todayIso,
      institutionOf: (id) => (id?.startsWith("manual:") ? "Apple Card" : id ? (institutions.get(id) ?? null) : null),
    }
  );

  const streams = streamsRes.data ?? [];
  const manual = manualRes.data ?? [];
  const entries: (EntryInput & { frequency: string | null; date: string | null; cardPayment?: boolean })[] = [
    ...streams.map((s) => {
      const key = `plaid-${s.id}`;
      return {
        key,
        source: "plaid" as const,
        name: streamDisplayName(s),
        amount: Math.abs(Number(s.average_amount ?? s.last_amount ?? 0)),
        active: Boolean(s.is_active) && !s.user_marked_cancelled,
        cancelled: Boolean(s.user_marked_cancelled),
        cancelledOn: cancellations[key] ?? null,
        frequency: s.frequency as string | null,
        date: effectiveNextDate(s.predicted_next_date as string | null, s.last_date as string | null, s.frequency as string | null),
        cardPayment: s.pfc_detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      };
    }),
    ...found.map((f) => ({
      key: `found-${f.key}`,
      source: "found" as const,
      name: f.name,
      amount: f.amount,
      active: f.active,
      cancelled: Boolean(f.cancelledOn),
      cancelledOn: f.cancelledOn,
      firstDate: f.firstDate,
      confirmed: review.prefs.confirmed.includes(`found-${f.key}`),
      frequency: f.frequency as string | null,
      date: f.nextDate,
    })),
    ...manual.map((m) => {
      const key = `manual-${m.id}`;
      return {
        key,
        source: "manual" as const,
        name: m.name as string,
        amount: Math.abs(Number(m.amount)),
        active: Boolean(m.is_active),
        cancelled: !m.is_active,
        cancelledOn: cancellations[key] ?? null,
        frequency: m.frequency as string | null,
        date: m.next_billing_date as string | null,
      };
    }),
  ];

  const r = reconcileSubscriptions(entries, charges, review.prefs, todayIso);
  const tracked = entries
    // Card payments the bank sees as recurring are money moving, not a subscription.
    .filter((e) => e.active && !r.covered.has(e.key) && !e.cardPayment && e.amount > 0)
    .map((e) => ({ key: e.key, source: e.source, name: e.name, amount: e.amount, frequency: e.frequency, date: e.date }));

  return {
    found,
    installments,
    covered: Object.fromEntries(r.covered),
    covers: Object.fromEntries(r.covers),
    cancellations,
    tracked,
    review: {
      newSubscriptions: r.newSubscriptions,
      afterCancel: r.afterCancel,
      toConfirm: found.filter((f) => r.toConfirm.includes(`found-${f.key}`)),
    },
    error: false,
  };
});
