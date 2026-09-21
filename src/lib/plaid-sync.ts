import "server-only";
import type { Transaction as PlaidTransaction, TransactionStream } from "plaid";
import { decrypt } from "@/lib/crypto";
import { sendNotification } from "@/lib/notify";
import { plaidClient } from "@/lib/plaid";
import { selectTransactionsToNotify, formatTransactionNotification } from "@/lib/plaid-notify-format";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// More than this many new transactions in one sync (e.g. an initial 730-day
// historical backfill) collapse into a single batched notification instead
// of one push per transaction.
const NOTIFY_BATCH_THRESHOLD = 5;

export type TransactionSyncResult =
  | {
      itemId: string;
      ok: true;
      added: number;
      modified: number;
      removed: number;
      notified: number;
    }
  | { itemId: string; ok: false; error: string };

export type RecurringSyncResult =
  | { itemId: string; ok: true; count: number }
  | { itemId: string; ok: false; error: string };

function extractPlaidError(
  err: unknown
): { error_code?: string; error_message?: string; error_type?: string } | null {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: unknown } }).response;
    const data = response?.data;
    if (data && typeof data === "object" && "error_code" in data) {
      return data as { error_code?: string; error_message?: string; error_type?: string };
    }
  }
  return null;
}

function errorMessage(err: unknown): string {
  const plaidError = extractPlaidError(err);
  if (plaidError?.error_message) return plaidError.error_message;
  return err instanceof Error ? err.message : String(err);
}

async function getDecryptedAccessToken(
  admin: AdminClient,
  itemDbId: string
): Promise<{ accessToken: string } | { error: string }> {
  const { data: item, error } = await admin
    .from("items")
    .select("access_token_encrypted")
    .eq("id", itemDbId)
    .single();

  if (error || !item) {
    return { error: "Item not found" };
  }

  try {
    return { accessToken: decrypt(item.access_token_encrypted) };
  } catch {
    return { error: "Failed to decrypt access token" };
  }
}

async function getAccountIdMap(
  admin: AdminClient,
  itemDbId: string
): Promise<Map<string, string>> {
  const { data: accountRows } = await admin
    .from("accounts")
    .select("id, plaid_account_id")
    .eq("item_id", itemDbId);

  return new Map((accountRows ?? []).map((a) => [a.plaid_account_id, a.id as string]));
}

function mapTransactionRow(t: PlaidTransaction, accountIdMap: Map<string, string>) {
  const accountId = accountIdMap.get(t.account_id);
  if (!accountId) return null;

  return {
    account_id: accountId,
    plaid_transaction_id: t.transaction_id,
    amount: t.amount,
    iso_currency_code: t.iso_currency_code,
    date: t.date,
    authorized_date: t.authorized_date,
    datetime: t.datetime,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    logo_url: t.logo_url ?? null,
    website: t.website ?? null,
    pfc_primary: t.personal_finance_category?.primary ?? null,
    pfc_detailed: t.personal_finance_category?.detailed ?? null,
    pfc_confidence: t.personal_finance_category?.confidence_level ?? null,
    payment_channel: t.payment_channel,
    pending: t.pending,
    pending_transaction_id: t.pending_transaction_id,
    raw: t,
  };
}

/**
 * Notifies on every newly *added* transaction, pending or not — a pending
 * charge is often exactly what someone wants to know about right away —
 * except settles of an already-notified pending transaction, which are
 * marked handled but not re-pushed. See selectTransactionsToNotify.
 */
async function notifyNewTransactions(
  admin: AdminClient,
  itemDbId: string,
  added: PlaidTransaction[],
  previouslyNotifiedIds: Set<string>
): Promise<number> {
  if (added.length === 0) return 0;

  const { toPush } = selectTransactionsToNotify(added, previouslyNotifiedIds);

  if (toPush.length > 0) {
    const { data: accountRows } = await admin
      .from("accounts")
      .select("plaid_account_id, name, mask")
      .eq("item_id", itemDbId);

    const accountByPlaidId = new Map((accountRows ?? []).map((a) => [a.plaid_account_id, a]));

    if (toPush.length > NOTIFY_BATCH_THRESHOLD) {
      await sendNotification(
        `${toPush.length} new transactions`,
        `Synced ${toPush.length} new transactions across your accounts.`
      );
    } else {
      for (const t of toPush) {
        const account = accountByPlaidId.get(t.account_id);
        const accountLabel = account
          ? `${account.name}${account.mask ? ` ••${account.mask}` : ""}`
          : "your account";
        const { subtitle, body } = formatTransactionNotification(t, accountLabel);
        await sendNotification(subtitle, body);
      }
    }
  }

  // Every added transaction is "handled" now, whether it was pushed or
  // deduped as a settle of one already notified — mark all of them so a
  // future re-sync never reconsiders them.
  const allIds = added.map((t) => t.transaction_id);
  await admin
    .from("transactions")
    .update({ notified_at: new Date().toISOString() })
    .in("plaid_transaction_id", allIds);

  return toPush.length;
}

async function applyPlaidSyncError(
  admin: AdminClient,
  itemDbId: string,
  err: unknown
): Promise<string> {
  const plaidError = extractPlaidError(err);

  if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
    await admin
      .from("items")
      .update({ status: "requires_reauth", error_code: plaidError.error_code })
      .eq("id", itemDbId);
  } else if (plaidError?.error_code) {
    // Status untouched: a transient/product error shouldn't flip an
    // otherwise-healthy item into a "needs user action" state.
    await admin.from("items").update({ error_code: plaidError.error_code }).eq("id", itemDbId);
  }

  return errorMessage(err);
}

export async function syncItemTransactions(
  itemDbId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<TransactionSyncResult> {
  const admin = createAdminClient();

  const { data: item, error: itemFetchError } = await admin
    .from("items")
    .select("id, access_token_encrypted, transactions_cursor")
    .eq("id", itemDbId)
    .single();

  if (itemFetchError || !item) {
    return { itemId: itemDbId, ok: false, error: "Item not found" };
  }

  let accessToken: string;
  try {
    accessToken = decrypt(item.access_token_encrypted);
  } catch {
    return { itemId: itemDbId, ok: false, error: "Failed to decrypt access token" };
  }

  // /transactions/sync only ever returns what Plaid has already cached for
  // this item — Plaid typically re-pulls from the institution somewhere
  // between 1-4x/day on its own schedule, so a same-day payment or charge
  // can be genuinely invisible to /transactions/sync (and to /accounts/get's
  // balance, which shares that same cache) for hours, with a clean "0
  // added" response that looks identical to "nothing happened yet."
  // /transactions/refresh forces Plaid to go extract fresh data from the
  // institution right now; the extraction itself is what this call waits
  // on, so /transactions/sync and /accounts/get immediately afterward see
  // the result without needing to wait for the SYNC_UPDATES_AVAILABLE
  // webhook this same call also fires. It's a paid, optional add-on
  // endpoint, so this only runs for the user-triggered "Sync now"/"Sync
  // all" buttons — not the daily cron backstop or webhook-driven syncs,
  // which stay on the free cached path. A refresh failure never fails the
  // sync outright; it just falls back to whatever Plaid already has cached.
  if (options.forceRefresh) {
    try {
      await plaidClient.transactionsRefresh({ access_token: accessToken });
    } catch (err) {
      console.error(`transactionsRefresh failed for item ${itemDbId}, continuing with cached sync`, err);
    }
  }

  let cursor: string | undefined = item.transactions_cursor ?? undefined;
  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: { transaction_id: string }[] = [];
  let hasMore = true;

  try {
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor,
      });

      added.push(...response.data.added);
      modified.push(...response.data.modified);
      removed.push(...response.data.removed);
      cursor = response.data.next_cursor;
      hasMore = response.data.has_more;
    }
  } catch (err) {
    const message = await applyPlaidSyncError(admin, itemDbId, err);
    return { itemId: itemDbId, ok: false, error: message };
  }

  const accountIdMap = await getAccountIdMap(admin, itemDbId);

  // Must run before the upsert/delete below: a pending transaction that
  // settled into a new transaction_id shows up in `removed` this same sync,
  // so its notified_at has to be read now or it's gone by the time
  // notifyNewTransactions needs it.
  const referencedIds = new Set<string>();
  for (const t of added) {
    referencedIds.add(t.transaction_id);
    if (t.pending_transaction_id) referencedIds.add(t.pending_transaction_id);
  }
  let previouslyNotifiedIds = new Set<string>();
  if (referencedIds.size > 0) {
    const { data: alreadyNotifiedRows } = await admin
      .from("transactions")
      .select("plaid_transaction_id")
      .in("plaid_transaction_id", Array.from(referencedIds))
      .not("notified_at", "is", null);
    previouslyNotifiedIds = new Set((alreadyNotifiedRows ?? []).map((r) => r.plaid_transaction_id));
  }

  const upsertRows = [...added, ...modified]
    .map((t) => mapTransactionRow(t, accountIdMap))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (upsertRows.length > 0) {
    const { error: upsertError } = await admin
      .from("transactions")
      .upsert(upsertRows, { onConflict: "plaid_transaction_id" });
    if (upsertError) {
      return {
        itemId: itemDbId,
        ok: false,
        error: `Failed to upsert transactions: ${upsertError.message}`,
      };
    }
  }

  if (removed.length > 0) {
    await admin
      .from("transactions")
      .delete()
      .in(
        "plaid_transaction_id",
        removed.map((r) => r.transaction_id)
      );
  }

  // Explicit accountsGet for every account on the item, not just the ones
  // that happened to appear in this sync's transaction delta — an account
  // with no new activity (e.g. a savings account nobody touched today)
  // previously never got a fresh balance here at all, only whatever it had
  // from its last sync with actual activity, silently going stale. A
  // balance-refresh failure doesn't fail the whole sync — the transactions
  // above already synced successfully, so log and keep going rather than
  // losing that.
  try {
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    for (const acct of accountsResponse.data.accounts) {
      const ourAccountId = accountIdMap.get(acct.account_id);
      if (!ourAccountId) continue;
      await admin
        .from("accounts")
        .update({
          current_balance: acct.balances.current,
          available_balance: acct.balances.available,
          credit_limit: acct.balances.limit,
        })
        .eq("id", ourAccountId);
    }
  } catch (err) {
    console.error(`Failed to refresh account balances for item ${itemDbId}`, err);
  }

  await admin
    .from("items")
    .update({
      transactions_cursor: cursor,
      last_synced_at: new Date().toISOString(),
      status: "active",
      error_code: null,
    })
    .eq("id", itemDbId);

  const notified = await notifyNewTransactions(admin, itemDbId, added, previouslyNotifiedIds);

  const recurringResult = await syncItemRecurring(itemDbId, accessToken);
  if (!recurringResult.ok) {
    console.error(`Recurring sync failed for item ${itemDbId}: ${recurringResult.error}`);
  }

  return {
    itemId: itemDbId,
    ok: true,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    notified,
  };
}

function mapStreamRow(
  s: TransactionStream,
  direction: "inflow" | "outflow",
  accountIdMap: Map<string, string>
) {
  const accountId = accountIdMap.get(s.account_id);
  if (!accountId) return null;

  return {
    stream_id: s.stream_id,
    account_id: accountId,
    direction,
    description: s.description,
    merchant_name: s.merchant_name,
    frequency: s.frequency,
    average_amount: s.average_amount?.amount ?? null,
    last_amount: s.last_amount?.amount ?? null,
    first_date: s.first_date,
    last_date: s.last_date,
    predicted_next_date: s.predicted_next_date ?? null,
    status: s.status,
    // Plaid's own `status` (MATURE / EARLY_DETECTION / TOMBSTONED / UNKNOWN)
    // drives this; only a TOMBSTONED stream is considered inactive.
    is_active: s.status !== "TOMBSTONED",
    pfc_primary: s.personal_finance_category?.primary ?? null,
    pfc_detailed: s.personal_finance_category?.detailed ?? null,
    transaction_ids: s.transaction_ids,
    raw: s,
    // user_marked_cancelled intentionally omitted: leaving it out of the
    // upsert payload means ON CONFLICT never touches it, preserving any
    // manual override from a future UI feature.
  };
}

export async function syncItemRecurring(
  itemDbId: string,
  accessTokenOverride?: string
): Promise<RecurringSyncResult> {
  const admin = createAdminClient();

  let accessToken = accessTokenOverride;
  if (!accessToken) {
    const result = await getDecryptedAccessToken(admin, itemDbId);
    if ("error" in result) {
      return { itemId: itemDbId, ok: false, error: result.error };
    }
    accessToken = result.accessToken;
  }

  let response;
  try {
    response = await plaidClient.transactionsRecurringGet({ access_token: accessToken });
  } catch (err) {
    return { itemId: itemDbId, ok: false, error: errorMessage(err) };
  }

  const accountIdMap = await getAccountIdMap(admin, itemDbId);

  const rows = [
    ...response.data.inflow_streams.map((s) => mapStreamRow(s, "inflow", accountIdMap)),
    ...response.data.outflow_streams.map((s) => mapStreamRow(s, "outflow", accountIdMap)),
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    const { error: upsertError } = await admin
      .from("recurring_streams")
      .upsert(rows, { onConflict: "stream_id" });
    if (upsertError) {
      return {
        itemId: itemDbId,
        ok: false,
        error: `Failed to upsert recurring streams: ${upsertError.message}`,
      };
    }
  }

  return { itemId: itemDbId, ok: true, count: rows.length };
}

export async function syncAllActiveItems(
  options: { forceRefresh?: boolean } = {}
): Promise<TransactionSyncResult[]> {
  const admin = createAdminClient();
  const { data: items } = await admin.from("items").select("id").eq("status", "active");

  const results: TransactionSyncResult[] = [];
  for (const item of items ?? []) {
    results.push(await syncItemTransactions(item.id, options));
  }
  return results;
}
