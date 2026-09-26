import "server-only";
import {
  bankSigninAlerts,
  budgetAlerts,
  highUtilizationAlerts,
  lowBalanceAlerts,
  priceIncreaseAlerts,
  installmentDueAlerts,
  refundAlerts,
  renewalAlerts,
  subscriptionReviewAlerts,
  unusualChargeAlerts,
  type Alert,
  type RenewalCandidate,
} from "@/lib/alerts-logic";
import type { AlertSettings } from "@/lib/alert-settings";
import { accountName } from "@/lib/account-settings";
import { depositReviewAlerts, depositsToReview } from "@/lib/deposit-review";
import { installmentPaymentsBetween } from "@/lib/installments";
import { summarizeUtilization } from "@/lib/credit-utilization";
import { importReminderAlerts } from "@/lib/import-reminders";
import { isDisconnected } from "@/lib/item-status";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { loadSubscriptions } from "@/lib/recurring-extras";
import { monthlySummary, monthlySummaryAlert } from "@/lib/monthly-summary";
import { loadAccountSettings, loadAlertSettings, loadAlertThresholds, loadDepositReviews, loadMonthlyBudget } from "@/lib/ui-preferences";
import { budgetPlan, budgetProgress, monthCategorySpending } from "@/lib/budgets";
import { sendNotification } from "@/lib/notify";
import { effectiveNextDate } from "@/lib/subscription-insights";
import { streamDisplayName } from "@/lib/transaction-display";
import { loadLedger } from "@/lib/spending-data";
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
      await sendNotification(alert.title, alert.body, alert.href);
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

  const [data, budgetsRes, streamsRes, manualSubsRes, accountsRes, itemsRes, snapshotsRes, settings, manualAccounts, accountSettings, monthlyBudget, thresholds, depositReviews, subscriptions] = await Promise.all([
    loadLedger(admin),
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
      .select("id, name, official_name, mask, type, available_balance, current_balance, credit_limit, item:items(institution_name)")
      .eq("is_hidden", false),
    admin.from("items").select("id, institution_name, status, error_code"),
    admin.from("net_worth_snapshots").select("date, net_worth").order("date", { ascending: true }),
    loadAlertSettings(admin),
    loadManualAccounts(admin),
    loadAccountSettings(admin),
    loadMonthlyBudget(admin),
    loadAlertThresholds(admin),
    loadDepositReviews(admin),
    // Every subscription, each counted once, and what's waiting on you about them.
    loadSubscriptions(admin),
  ]);

  // A failed read must not look like "nothing to alert about" for that
  // category, and must not stop the other categories from being checked.
  const alerts: Alert[] = [];
  const currency = data.currency;

  if (data.error || budgetsRes.error || monthlyBudget.error) {
    console.error("Skipping budget alerts: load failed", budgetsRes.error);
  } else {
    const spent = monthCategorySpending(data.spending, now.year, now.month);
    const list = (budgetsRes.data ?? []).map((b) => ({ id: b.id, category: b.category, monthly_amount: Number(b.monthly_amount) }));
    const progress = budgetProgress(spent, list, now);
    const plan = budgetPlan(spent, list, monthlyBudget.amount, now);
    alerts.push(...budgetAlerts(progress, now.isoDate.slice(0, 7), currency, plan.month));
  }

  if (data.error) {
    console.error("Skipping unusual-charge alerts: load failed");
  } else {
    alerts.push(...unusualChargeAlerts(data.spending, now.isoDate, currency));
  }

  // Early in a new month, one summary of the month before. Limited to the
  // first week so a late first run doesn't send a stale one.
  if (Number(now.isoDate.slice(8, 10)) <= 7) {
    if (data.error || budgetsRes.error || snapshotsRes.error) {
      console.error("Skipping the monthly summary: load failed", budgetsRes.error ?? snapshotsRes.error);
    } else {
      const summary = monthlySummary(
        data.transactions,
        data.spending,
        (budgetsRes.data ?? []).map((b) => ({ id: b.id, category: b.category, monthly_amount: Number(b.monthly_amount) })),
        (snapshotsRes.data ?? []).map((r) => ({ date: r.date as string, net_worth: Number(r.net_worth) })),
        now.isoDate,
        monthlyBudget.amount
      );
      if (summary) alerts.push(monthlySummaryAlert(summary, currency));
    }
  }

  if (itemsRes.error) {
    console.error("Skipping bank sign-in alerts: load failed", itemsRes.error);
  } else {
    alerts.push(
      ...bankSigninAlerts(
        (itemsRes.data ?? [])
          .filter((i) => isDisconnected(i))
          .map((i) => ({ id: i.id as string, name: (i.institution_name as string | null) ?? "A bank" })),
        now.isoDate
      )
    );
  }

  if (streamsRes.error || manualSubsRes.error) {
    console.error("Skipping subscription alerts: load failed", streamsRes.error ?? manualSubsRes.error);
  } else {
    const streams = (streamsRes.data ?? []).map((s) => ({
      id: s.id as string,
      name: streamDisplayName(
        { merchant_name: s.merchant_name as string | null, description: s.description as string | null },
        "outflow",
        "A subscription"
      ),
      average_amount: s.average_amount as number | null,
      last_amount: s.last_amount as number | null,
      frequency: s.frequency as string | null,
      date: effectiveNextDate(s.predicted_next_date as string | null, s.last_date as string | null, s.frequency as string | null),
    }));
    alerts.push(...priceIncreaseAlerts(streams, currency));
  }

  // Renewals of everything tracked (the bank's, found in your charges, or
  // yours, each once), and subscriptions waiting on an answer.
  if (subscriptions.error) {
    console.error("Skipping renewal and subscription review alerts: load failed");
  } else {
    const candidates: RenewalCandidate[] = subscriptions.tracked.map((t) => ({
      source: t.source,
      // The key without its source, as renewal keys have always been.
      id: t.key.slice(t.source.length + 1),
      name: t.name,
      amount: t.amount,
      frequency: t.frequency,
      date: t.date,
    }));
    alerts.push(...renewalAlerts(candidates, today, thresholds.renewalDaysAhead, currency), ...subscriptionReviewAlerts(subscriptions.review, currency));
    // Installment payments coming up, on the same days-ahead as renewals.
    const through = new Date(Date.parse(`${now.isoDate}T00:00:00Z`) + thresholds.renewalDaysAhead * 86_400_000).toISOString().slice(0, 10);
    alerts.push(...installmentDueAlerts(installmentPaymentsBetween(subscriptions.installments, now.isoDate, through), now.isoDate, currency));
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
        thresholds.lowBalance,
        currency
      )
    );
  }

  if (accountsRes.error || manualAccounts.error) {
    console.error("Skipping card utilization alerts: load failed");
  } else {
    const utilization = summarizeUtilization([
      ...manualAccounts.accounts
        .filter((c) => c.type === "credit")
        .map((c) => ({ id: `manual:${c.id}`, name: c.name, mask: c.mask, institution: c.institution_name, balance: c.balance, limit: c.credit_limit })),
      ...(accountsRes.data ?? [])
        .filter((a) => a.type === "credit")
        .map((a) => ({
          id: a.id as string,
          name: accountName({ name: a.name as string, official_name: a.official_name as string | null }, accountSettings[a.id as string]),
          mask: a.mask as string | null,
          institution: (a.item as unknown as { institution_name: string | null } | null)?.institution_name ?? null,
          balance: a.current_balance === null ? null : Number(a.current_balance),
          limit: a.credit_limit === null ? null : Number(a.credit_limit),
        })),
    ]);
    alerts.push(...highUtilizationAlerts(utilization.cards, now.isoDate.slice(0, 7), currency));
  }

  if (manualAccounts.error) {
    console.error("Skipping Apple import reminders: load failed");
  } else {
    alerts.push(...importReminderAlerts(manualAccounts.accounts, now.isoDate));
  }

  // Deposits waiting for an answer (a Zelle from a friend, a check).
  if (data.error || depositReviews.error) {
    console.error("Skipping deposit review alerts: load failed");
  } else {
    const cardIds = new Set(data.cards.map((c) => c.id));
    alerts.push(...depositReviewAlerts(depositsToReview(data.transactions, cardIds, depositReviews.reviews, now.isoDate), now.isoDate, currency));
  }

  // Money back from a store, and the purchase it's for. Last: it's good
  // news, so in a burst it's the one folded into the summary push.
  if (data.error) {
    console.error("Skipping refund alerts: load failed");
  } else {
    alerts.push(...refundAlerts(data.transactions, new Set(data.cards.map((c) => c.id)), now.isoDate, currency));
  }

  return dispatchAlerts(admin, enabledAlerts(alerts, settings));
}

/** Drops the kinds switched off in settings. They aren't recorded either, so switching one back on picks up what's true then. */
export function enabledAlerts(alerts: Alert[], settings: AlertSettings): Alert[] {
  return alerts.filter((a) => settings[a.kind]);
}
