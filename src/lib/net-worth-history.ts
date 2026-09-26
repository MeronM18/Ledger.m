import "server-only";
import { cache } from "react";
import { MAX_HISTORY_DAYS, type HistoryTx } from "@/lib/account-history";
import { buildBoard, historyStartFor, netWorthSeries, type ManualAssetInput } from "@/lib/accounts-board";
import { assetHistories, dayOf, loadAssetValues } from "@/lib/asset-history";
import { withValue, type ValuePoint } from "@/lib/asset-values";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";
import { loadLedger } from "@/lib/spending-data";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { loadAccountSettings } from "@/lib/ui-preferences";

type AdminClient = ReturnType<typeof createAdminClient>;

export type NetWorthHistory = {
  // The first day of the series.
  start: string;
  // Net worth at the end of each day from `start` through today, oldest first; the last is today's.
  series: number[];
  error: boolean;
};

/**
 * Net worth day by day, worked out the way the Accounts page works it out
 * (accounts-board.ts): every account's balance walked back through its
 * transactions, assets at the values they had, metals from the day each
 * was added. So the Overview's line and the Accounts page's always agree.
 */
export const loadNetWorthHistory = cache(async function loadNetWorthHistory(admin: AdminClient): Promise<NetWorthHistory> {
  const [{ data: items, error }, { accounts: manualCards, error: manualError }, settings, ledger, { data: assetRows, error: assetsError }, { data: holdingsData }, assetValues, { data: pricesData }] =
    await Promise.all([
      admin
        .from("items")
        .select("id, institution_name, last_synced_at, accounts(id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, apy, is_hidden, iso_currency_code)"),
      loadManualAccounts(admin),
      loadAccountSettings(admin),
      loadLedger(admin),
      admin.from("manual_assets").select("id, name, category, value, is_liability, notes, created_at, updated_at"),
      admin.from("precious_metal_holdings").select("id, metal, weight, weight_unit, purity, created_at"),
      loadAssetValues(admin),
      admin.from("metal_prices").select("metal, price_per_troy_oz_usd, fetched_at"),
    ]);
  const today = calendarNow().isoDate;
  if (error || manualError || assetsError || ledger.error) {
    if (error) console.error("Failed to load accounts for net worth history", error);
    return { start: today, series: [], error: true };
  }

  const transactionsByAccount = new Map<string, HistoryTx[]>();
  for (const t of ledger.transactions) {
    if (!t.account) continue;
    const list = transactionsByAccount.get(t.account.id) ?? [];
    list.push({ date: t.posted_date ?? t.date, amount: t.amount, pending: t.pending });
    transactionsByAccount.set(t.account.id, list);
  }
  const historyStart = historyStartFor(transactionsByAccount, today, MAX_HISTORY_DAYS);

  const holdings = holdingsData ?? [];
  const prices = pricesData ?? [];
  const assetList = ((assetRows ?? []) as (ManualAssetInput & { created_at: string | null })[]).map((a) => ({ ...a, value: Number(a.value) }));
  const histories = assetHistories(assetValues, assetList);
  const metalPoints = holdings.every((h) => h.created_at)
    ? [...holdings]
        .map((h) => ({ date: dayOf(h.created_at as string) as string, value: totalPreciousMetalsValue([h], prices) }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .reduce<ValuePoint[]>((points, h) => withValue(points, h.date, (points.at(-1)?.value ?? 0) + h.value), [])
    : [];

  type Item = { institution_name: string | null; last_synced_at: string | null; accounts: Record<string, unknown>[] };
  const board = buildBoard({
    plaid: ((items ?? []) as unknown as Item[]).flatMap((item) =>
      item.accounts.map((a) => ({
        ...(a as Parameters<typeof buildBoard>[0]["plaid"][number]),
        current_balance: a.current_balance === null ? null : Number(a.current_balance),
        credit_limit: a.credit_limit === null ? null : Number(a.credit_limit),
        apy: a.apy === null ? null : Number(a.apy),
        institution: item.institution_name,
        last_synced_at: item.last_synced_at,
      }))
    ),
    manualAccounts: manualCards,
    assets: assetList.map((a) => ({ ...a, points: histories[a.id] })),
    metals: {
      value: totalPreciousMetalsValue(holdings, prices),
      count: holdings.length,
      pricedAt: prices.map((p) => p.fetched_at as string | null).filter(Boolean).sort().at(-1) ?? null,
      kinds: Array.from(new Set(holdings.map((h) => h.metal as "gold" | "silver"))),
      points: metalPoints,
    },
    settings,
    transactions: transactionsByAccount,
    todayIso: today,
    historyStart,
  });

  return { start: historyStart, series: netWorthSeries(board), error: false };
});
