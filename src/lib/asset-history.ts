import "server-only";
import { effectiveValues, resolveAssetValues, shifted, withValue, type AssetValues, type ValuePoint } from "@/lib/asset-values";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

type AdminClient = ReturnType<typeof createAdminClient>;

// Each asset's dated values (asset-values.ts), kept in ui_preferences like
// the other things only you tell the app, so a restore brings them back.
export const ASSET_VALUES_KEY = "asset_values";

/** An Eastern calendar day from a stored timestamp. */
export const dayOf = (timestamp: string | null | undefined): string | null => (timestamp ? calendarNow(new Date(timestamp)).isoDate : null);

export async function loadAssetValues(admin: AdminClient): Promise<AssetValues> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", ASSET_VALUES_KEY).maybeSingle();
  if (error) console.error("Failed to load asset values", error);
  return resolveAssetValues(data?.value);
}

async function save(admin: AdminClient, all: AssetValues): Promise<void> {
  const { error } = await admin.from("ui_preferences").upsert({ key: ASSET_VALUES_KEY, value: all }, { onConflict: "key" });
  if (error) console.error("Failed to save asset values", error);
}

type Known = { id: string; created_at?: string | null; updated_at?: string | null; value: number };

/** What's recorded for an asset, or its implicit history (its value from the day it was added). */
function historyOf(all: AssetValues, asset: Known): ValuePoint[] {
  return effectiveValues(all[asset.id], dayOf(asset.created_at), Number(asset.value), dayOf(asset.updated_at));
}

/**
 * Records `value` as what the asset was worth on `date`, and returns what
 * it's worth now (its latest value): a date in the past fills in history
 * and leaves today's value as it was.
 */
export async function recordAssetValue(admin: AdminClient, asset: Known, date: string, value: number): Promise<number> {
  const all = await loadAssetValues(admin);
  const next = withValue(historyOf(all, asset), date, value);
  all[asset.id] = next;
  await save(admin, all);
  return next[next.length - 1].value;
}

/** Starts an asset's history: `value` from `date`. */
export async function startAssetValues(admin: AdminClient, id: string, date: string, value: number): Promise<void> {
  const all = await loadAssetValues(admin);
  all[id] = [{ date, value: Math.round(value * 100) / 100 }];
  await save(admin, all);
}

/** Moves the asset's value by `delta` from `date` on (cash spent or received that day). */
export async function shiftAssetValues(admin: AdminClient, asset: Known, date: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const all = await loadAssetValues(admin);
  all[asset.id] = shifted(historyOf(all, asset), date, delta);
  await save(admin, all);
}

/**
 * Takes one day's value out of an asset's history, and returns what it's
 * worth now. The only value can't go: an asset always has a value.
 */
export async function removeAssetValue(admin: AdminClient, asset: Known, date: string): Promise<{ value: number } | { error: string }> {
  const all = await loadAssetValues(admin);
  const history = historyOf(all, asset);
  if (!history.some((p) => p.date === date)) return { error: "There's no value on that day" };
  if (history.length === 1) return { error: "Its only value can't be removed" };
  const next = history.filter((p) => p.date !== date);
  all[asset.id] = next;
  await save(admin, all);
  return { value: next[next.length - 1].value };
}

export async function forgetAssetValues(admin: AdminClient, id: string): Promise<void> {
  const all = await loadAssetValues(admin);
  if (!(id in all)) return;
  delete all[id];
  await save(admin, all);
}

/** Every asset's history to count by, for the net worth line. */
export function assetHistories(all: AssetValues, assets: Known[]): Record<string, ValuePoint[]> {
  return Object.fromEntries(assets.map((a) => [a.id, historyOf(all, a)]));
}
