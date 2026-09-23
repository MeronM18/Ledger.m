import "server-only";
import { ALERT_THRESHOLDS } from "@/lib/config";
import {
  budgetAlerts,
  lowBalanceAlerts,
  priceIncreaseAlerts,
  renewalAlerts,
  type Alert,
  type RenewalCandidate,
} from "@/lib/alerts-logic";
import { budgetProgress } from "@/lib/budgets";
import { sendNotification } from "@/lib/notify";
import { effectiveNextDate } from "@/lib/subscription-insights";
import { categoryTotalsForMonth } from "@/lib/spending-aggregation";
import { loadSpendingData } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow, easternToday } from "@/lib/time";

type AdminClient = ReturnType<typeof createAdminClient>;

// After a long gap (first run, or a sync that finally catches up) many
// alerts can become true at once. Past this many pushes in one run the
// rest are still recorded in the app but folded into one summary push.
const MAX_PUSHES_PER_RUN = 5;

export type AlertRunResult = { sent: number; recordedOnly: number; alreadySent: number; failed: number };

/**
 * Sends each alert at most once. The insert comes first: the unique
 * dedupe_key turns "already handled" into a database fact, so overlapping
 * runs (a webhook sync and the daily cron) can't double-send. If the push
 * itself fails, the row is removed so the next run retries it.
 */
export async function dispatchAlerts(admin: AdminClient, alerts: Alert[]): Promise<AlertRunResult> {
  const result: AlertRunResult = { sent: 0, recordedOnly: 0, alreadySent: 0, failed: 0 };

  for (const alert of alerts) {
    const { data, error } = await admin
      .from("alert_events")
      .upsert(
        { dedupe_key: alert.key, kind: alert.kind, title: alert.title, body: alert.body },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      )
      .select("id");

    if (error) {
      console.error(`Failed to record alert ${alert.key}`, error);
      result.failed++;
      continue;
    }
    if (!data || data.length === 0) {
      result.alreadySent++;
      continue;
    }
    if (result.sent >= MAX_PUSHES_PER_RUN) {
      result.recordedOnly++;
      continue;
    }

    try {
      await sendNotification(alert.title, alert.body);
      result.sent++;
    } catch (err) {
      console.error(`Failed to push alert ${alert.key}`, err);
      await admin.from("alert_events").delete().eq("id", data[0].id);
      result.failed++;
    }
  }

  if (result.recordedOnly > 0) {
    try {
      await sendNotification(
        `${result.recordedOnly} more alerts`,
        "Open Ledger.m to see the rest of your recent alerts."
      );
    } catch (err) {
      console.error("Failed to push alert summary", err);
    }
  }

  return result;
}

/** Everything that's true right now, checked in one pass. */
export async function runAlertChecks(admin: AdminClient = createAdminClient()): Promise<AlertRunResult> {
  const now = calendarNow();
  const today = easternToday();

  const [data, budgetsRes, streamsRes, manualSubsRes, accountsRes] = await Promise.all([
    loadSpendingData(admin),
    admin.from("budgets").select("id, category, monthly_amount"),
    admin
      .from("recurring_streams")
      .select("id, merchant_name, description, average_amount, last_amount, frequency, predicted_next_date, last_date")
      .eq("direction", "outflow")
      .eq("is_active", true)
      .eq("user_marked_cancelled", false),
    admin
      .from("manual_subscriptions")
      .select("id, name, amount, frequency, next_billing_date")
      .eq("is_active", true),
    admin
      .from("accounts")
      .select("id, name, mask, type, available_balance, current_balance")
      .eq("is_hidden", false),
  ]);

  // A failed read must not look like "nothing to alert about" for that
  // category, and must not stop the other categories from being checked.
  const alerts: Alert[] = [];
  const currency = data.currency;

  if (data.error || budgetsRes.error) {
    console.error("Skipping budget alerts: load failed", budgetsRes.error);
  } else {
    const progress = budgetProgress(
      categoryTotalsForMonth(data.spending, now.year, now.month),
      (budgetsRes.data ?? []).map((b) => ({ id: b.id, category: b.category, monthly_amount: Number(b.monthly_amount) })),
      now
    );
    alerts.push(...budgetAlerts(progress, now.isoDate.slice(0, 7), currency));
  }

  if (streamsRes.error || manualSubsRes.error) {
    console.error("Skipping subscription alerts: load failed", streamsRes.error ?? manualSubsRes.error);
  } else {
    const streams = (streamsRes.data ?? []).map((s) => ({
      id: s.id as string,
      name: (s.merchant_name || s.description || "A subscription") as string,
      average_amount: s.average_amount as number | null,
      last_amount: s.last_amount as number | null,
      frequency: s.frequency as string | null,
      date: effectiveNextDate(s.predicted_next_date as string | null, s.last_date as string | null, s.frequency as string | null),
    }));
    const candidates: RenewalCandidate[] = [
      ...streams.map((s) => ({
        source: "plaid" as const,
        id: s.id,
        name: s.name,
        amount: s.average_amount ?? s.last_amount ?? 0,
        frequency: s.frequency,
        date: s.date,
      })),
      ...(manualSubsRes.data ?? []).map((m) => ({
        source: "manual" as const,
        id: m.id as string,
        name: m.name as string,
        amount: Number(m.amount),
        frequency: m.frequency as string,
        date: m.next_billing_date as string | null,
      })),
    ];
    alerts.push(
      ...renewalAlerts(candidates, today, ALERT_THRESHOLDS.renewalDaysAhead, currency),
      ...priceIncreaseAlerts(streams, currency)
    );
  }

  if (accountsRes.error) {
    console.error("Skipping balance alerts: load failed", accountsRes.error);
  } else {
    alerts.push(
      ...lowBalanceAlerts(
        (accountsRes.data ?? []).map((a) => ({
          ...a,
          available_balance: a.available_balance === null ? null : Number(a.available_balance),
          current_balance: a.current_balance === null ? null : Number(a.current_balance),
        })),
        now.isoDate,
        ALERT_THRESHOLDS.lowBalance,
        currency
      )
    );
  }

  return dispatchAlerts(admin, alerts);
}
