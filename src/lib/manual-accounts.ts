import "server-only";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ManualAccount = {
  id: string;
  name: string;
  institution_name: string;
  mask: string | null;
  credit_limit: number | null;
  balance_override: number | null;
  // Amount owed: the typed-in override if there is one, otherwise the sum of
  // the imported transactions (purchases positive, payments negative).
  balance: number;
  transactionCount: number;
  lastTransactionDate: string | null;
};

/** Every manual account (Apple Card) with its balance worked out from its imported transactions. */
export async function loadManualAccounts(
  admin: AdminClient
): Promise<{ accounts: ManualAccount[]; error: boolean }> {
  const [accountsRes, txRes] = await Promise.all([
    admin
      .from("manual_accounts")
      .select("id, name, institution_name, mask, credit_limit, balance_override")
      .order("created_at"),
    fetchAllRows<{ manual_account_id: string; amount: number; date: string }>((from, to) =>
      admin
        .from("manual_transactions")
        .select("manual_account_id, amount, date")
        .not("manual_account_id", "is", null)
        .order("id")
        .range(from, to)
    ),
  ]);

  if (accountsRes.error) console.error("Failed to load manual accounts", accountsRes.error);
  if (txRes.error) console.error("Failed to load manual account transactions", txRes.error);
  if (accountsRes.error || txRes.error) return { accounts: [], error: true };

  const sums = new Map<string, { sum: number; count: number; last: string | null }>();
  for (const t of txRes.data ?? []) {
    const entry = sums.get(t.manual_account_id) ?? { sum: 0, count: 0, last: null };
    entry.sum += Number(t.amount);
    entry.count += 1;
    if (entry.last === null || t.date > entry.last) entry.last = t.date;
    sums.set(t.manual_account_id, entry);
  }

  return {
    error: false,
    accounts: (accountsRes.data ?? []).map((a) => {
      const s = sums.get(a.id);
      const override = a.balance_override === null ? null : Number(a.balance_override);
      return {
        id: a.id as string,
        name: a.name as string,
        institution_name: a.institution_name as string,
        mask: a.mask as string | null,
        credit_limit: a.credit_limit === null ? null : Number(a.credit_limit),
        balance_override: override,
        balance: override ?? Math.round((s?.sum ?? 0) * 100) / 100,
        transactionCount: s?.count ?? 0,
        lastTransactionDate: s?.last ?? null,
      };
    }),
  };
}

/**
 * The institutions whose card purchases are already in the app, so a payment
 * to one of them is not counted as spending a second time. Connected credit
 * accounts (Chase) plus any manual card account (Apple Card).
 */
export async function loadConnectedCardIssuers(
  admin: AdminClient
): Promise<{ issuers: string[]; error: boolean }> {
  const [plaidRes, manualRes] = await Promise.all([
    admin.from("accounts").select("item:items(institution_name)").eq("type", "credit"),
    admin.from("manual_accounts").select("institution_name").eq("type", "credit"),
  ]);

  if (plaidRes.error) console.error("Failed to load connected credit accounts", plaidRes.error);
  if (manualRes.error) console.error("Failed to load manual card accounts", manualRes.error);

  const names = [
    ...(plaidRes.data ?? []).map(
      (a) => (a.item as unknown as { institution_name: string | null } | null)?.institution_name
    ),
    ...(manualRes.data ?? []).map((a) => a.institution_name as string | null),
  ].filter((n): n is string => Boolean(n));

  return { issuers: Array.from(new Set(names)), error: Boolean(plaidRes.error || manualRes.error) };
}
