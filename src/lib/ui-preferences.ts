import "server-only";
import { cache } from "react";
import { z } from "zod";
import { resolveAccountSettings, type AccountSettings } from "@/lib/account-settings";
import { resolveAlertSettings, type AlertSettings } from "@/lib/alert-settings";
import { cardOrderKey, type CardOrderPage } from "@/lib/card-order";
import { resolveImportLog, type ImportLog } from "@/lib/import-reminders";
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
