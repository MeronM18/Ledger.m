import "server-only";
import { cache } from "react";
import { z } from "zod";
import { resolveAccountSettings, type AccountSettings } from "@/lib/account-settings";
import { resolveAlertThresholds, resolveDisplayName, type AlertThresholds } from "@/lib/app-preferences";
import { resolveAlertSettings, type AlertSettings } from "@/lib/alert-settings";
import { resolveMonthlyBudget } from "@/lib/budgets";
import { resolveDepositReviews, type DepositReviews } from "@/lib/deposit-review";
import { cardOrderKey, type CardOrderPage } from "@/lib/card-order";
import { resolveImportLog, type ImportLog } from "@/lib/import-reminders";
import { resolveInstallmentPrefs, type InstallmentPrefs } from "@/lib/installments";
import { resolveRefundChoices, type RefundChoices } from "@/lib/refunds";
import { resolveFoundRecurring, type FoundRecurringPrefs } from "@/lib/found-recurring";
import { resolveSubscriptionReview, type SubscriptionReviewPrefs } from "@/lib/subscription-review";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const orderSchema = z.array(z.string());

/**
 * The saved card order for a page, or [] when there's none. Never fails the
 * page: if the preference can't be read, the cards just keep their default
 * order.
 */
export async function loadCardOrder(admin: AdminClient, page: CardOrderPage): Promise<string[]> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", cardOrderKey(page)).maybeSingle();
  if (error) {
    console.error("Failed to load card order", error);
    return [];
  }
  const parsed = orderSchema.safeParse(data?.value);
  return parsed.success ? parsed.data : [];
}

export const ALERT_SETTINGS_KEY = "alert_settings";

/**
 * Which pushes are on. If they can't be read, everything counts as on:
 * a missed alert is worse than one the user had switched off.
 */
export async function loadAlertSettings(admin: AdminClient): Promise<AlertSettings> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", ALERT_SETTINGS_KEY).maybeSingle();
  if (error) console.error("Failed to load alert settings", error);
  return resolveAlertSettings(data?.value);
}

export const ALERT_THRESHOLDS_KEY = "alert_thresholds";

/** The amounts and days alerts go by. If they can't be read, the defaults. */
export const loadAlertThresholds = cache(async function loadAlertThresholds(admin: AdminClient): Promise<AlertThresholds> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", ALERT_THRESHOLDS_KEY).maybeSingle();
  if (error) console.error("Failed to load alert thresholds", error);
  return resolveAlertThresholds(data?.value);
});

export const DISPLAY_NAME_KEY = "display_name";

/** The name the Overview greets you by. */
export const loadDisplayName = cache(async function loadDisplayName(admin: AdminClient): Promise<string> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", DISPLAY_NAME_KEY).maybeSingle();
  if (error) console.error("Failed to load the display name", error);
  return resolveDisplayName(data?.value);
});

// Each goal's icon, color and how its accounts count (goal-options.ts), by goal id.
export const GOAL_OPTIONS_KEY = "goal_options";

export const ACCOUNT_SETTINGS_KEY = "account_settings";

/** Names, statement closing days and due days you've set, by account id. */
export const loadAccountSettings = cache(async function loadAccountSettings(admin: AdminClient): Promise<AccountSettings> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", ACCOUNT_SETTINGS_KEY).maybeSingle();
  if (error) console.error("Failed to load account settings", error);
  return resolveAccountSettings(data?.value);
});

export const IMPORT_LOG_KEY = "manual_imports";

/** When each Apple account's statements were imported, newest first. */
export const loadImportLog = cache(async function loadImportLog(admin: AdminClient): Promise<{ log: ImportLog; error: boolean }> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", IMPORT_LOG_KEY).maybeSingle();
  if (error) console.error("Failed to load the import log", error);
  return { log: resolveImportLog(data?.value), error: Boolean(error) };
});

export const ALERTS_SEEN_KEY = "alerts_seen_at";

/** When the alerts bell was last opened (the newest alert it showed), or null if never. */
export async function loadAlertsSeenAt(admin: AdminClient): Promise<string | null> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", ALERTS_SEEN_KEY).maybeSingle();
  if (error) console.error("Failed to load when alerts were last seen", error);
  const parsed = z.string().datetime({ offset: true }).safeParse(data?.value);
  return parsed.success ? parsed.data : null;
}

export const MONTHLY_BUDGET_KEY = "monthly_budget";

/** The monthly spending budget, or null when none is set. */
export const loadMonthlyBudget = cache(async function loadMonthlyBudget(admin: AdminClient): Promise<{ amount: number | null; error: boolean }> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", MONTHLY_BUDGET_KEY).maybeSingle();
  if (error) console.error("Failed to load the monthly budget", error);
  return { amount: resolveMonthlyBudget(data?.value), error: Boolean(error) };
});

export const DEPOSIT_REVIEWS_KEY = "deposit_reviews";

/** What each reviewed deposit was said to be, by transaction id. `error` when they couldn't be read. */
export const loadDepositReviews = cache(async function loadDepositReviews(admin: AdminClient): Promise<{ reviews: DepositReviews; error: boolean }> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", DEPOSIT_REVIEWS_KEY).maybeSingle();
  if (error) console.error("Failed to load deposit reviews", error);
  return { reviews: resolveDepositReviews(data?.value), error: Boolean(error) };
});

export const REFUND_CHOICES_KEY = "refund_matches";

/** The purchase you said each refund is for, or that it has none, by refund id. */
export const loadRefundChoices = cache(async function loadRefundChoices(admin: AdminClient): Promise<{ choices: RefundChoices; error: boolean }> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", REFUND_CHOICES_KEY).maybeSingle();
  if (error) console.error("Failed to load refund choices", error);
  return { choices: resolveRefundChoices(data?.value), error: Boolean(error) };
});

export const INSTALLMENTS_KEY = "installment_plans";

/** Names, icons and lengths you've given installment plans, and plans you added. */
export const loadInstallmentPrefs = cache(async function loadInstallmentPrefs(
  admin: AdminClient
): Promise<{ prefs: InstallmentPrefs; error: boolean }> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", INSTALLMENTS_KEY).maybeSingle();
  if (error) console.error("Failed to load installment plans", error);
  return { prefs: resolveInstallmentPrefs(data?.value), error: Boolean(error) };
});

export const FOUND_RECURRING_KEY = "found_recurring";

/** Recurring charges found on their own that you've dismissed or cancelled. */
export const loadFoundRecurring = cache(async function loadFoundRecurring(
  admin: AdminClient
): Promise<{ prefs: FoundRecurringPrefs; error: boolean }> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", FOUND_RECURRING_KEY).maybeSingle();
  if (error) console.error("Failed to load found recurring charges", error);
  return { prefs: resolveFoundRecurring(data?.value), error: Boolean(error) };
});

export const SUBSCRIPTION_REVIEW_KEY = "subscription_review";

/** When you cancelled each subscription, and your answers about new ones and charges after a cancel. */
export const loadSubscriptionReview = cache(async function loadSubscriptionReview(
  admin: AdminClient
): Promise<{ prefs: SubscriptionReviewPrefs; error: boolean }> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", SUBSCRIPTION_REVIEW_KEY).maybeSingle();
  if (error) console.error("Failed to load subscription review", error);
  return { prefs: resolveSubscriptionReview(data?.value), error: Boolean(error) };
});
