import "server-only";
import { computeNetWorth, manualCardsAsAccounts } from "@/lib/net-worth";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";
import { createAdminClient } from "@/lib/supabase/admin";

// Same America/New_York "today" convention established for the greeting
// header and manual-transaction date default — this app has one real user
// in one real place, so "today" means their local calendar day, not UTC's.
function todayIsoDateEastern(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export type NetWorthSnapshotResult =
  | { ok: true; date: string; totalAssets: number; totalLiabilities: number; netWorth: number }
  | { ok: false; error: string };

/**
 * Computes net worth via the exact same computeNetWorth() formula /assets
 * and /overview already use, and upserts today's snapshot — re-running this
 * later the same day corrects that day's row instead of accumulating a
 * second one, so a manual "run it again" (via the button or a retried cron)
 * is always safe.
 */
export async function takeNetWorthSnapshot(): Promise<NetWorthSnapshotResult> {
  const admin = createAdminClient();

  const [
    { data: accountsData, error: acctError },
    { data: manualData, error: manualError },
    { data: holdingsData, error: holdingsError },
    { data: pricesData, error: pricesError },
    { accounts: manualCards, error: manualCardsError },
  ] = await Promise.all([
    admin.from("accounts").select("type, current_balance").eq("is_hidden", false),
    admin.from("manual_assets").select("value, is_liability"),
    admin.from("precious_metal_holdings").select("metal, weight, weight_unit, purity"),
    admin.from("metal_prices").select("metal, price_per_troy_oz_usd"),
    loadManualAccounts(admin),
  ]);

  const queryError = acctError ?? manualError ?? holdingsError ?? pricesError ?? (manualCardsError ? { message: "manual accounts" } : null);
  if (queryError) {
    console.error("Failed to load data for net worth snapshot", queryError);
    return { ok: false, error: queryError.message };
  }

  const preciousMetalsValue = totalPreciousMetalsValue(holdingsData ?? [], pricesData ?? []);
  const { totalAssets, totalLiabilities, netWorth } = computeNetWorth(
    [...(accountsData ?? []), ...manualCardsAsAccounts(manualCards)],
    manualData ?? [],
    preciousMetalsValue
  );

  const date = todayIsoDateEastern();
  const { error: upsertError } = await admin.from("net_worth_snapshots").upsert(
    {
      date,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: netWorth,
    },
    { onConflict: "date" }
  );

  if (upsertError) {
    console.error("Failed to upsert net worth snapshot", upsertError);
    return { ok: false, error: upsertError.message };
  }

  return { ok: true, date, totalAssets, totalLiabilities, netWorth };
}
