import "server-only";
import { cache } from "react";
import { accountName } from "@/lib/account-settings";
import { MAX_HISTORY_DAYS, type HistoryTx } from "@/lib/account-history";
import { historyStartFor } from "@/lib/accounts-board";
import { GOAL_OPTIONS_KEY, loadAccountSettings } from "@/lib/ui-preferences";
import { DEFAULT_OPTIONS, countedAccount, resolveGoalOptions } from "@/lib/goal-options";
import type { AccountChoice, GoalRow } from "@/components/goals-manager";
import { goalInsight, paySummary, type GoalAccount, type PaySummary } from "@/lib/goal-insights";
import { goalProgress } from "@/lib/goals";
import { incomeStats, isInterest } from "@/lib/income";
import type { createAdminClient } from "@/lib/supabase/admin";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { loadLedger } from "@/lib/spending-data";
import { humanizeTransactionName } from "@/lib/transaction-display";
import { calendarNow } from "@/lib/time";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Every savings goal with its progress and what its history says (pace,
 * forecast, plan), plus the accounts a goal can follow and the pay picture
 * plans are measured against. Shared by /goals and the overview.
 */
export const loadGoals = cache(async function loadGoals(
  admin: AdminClient
): Promise<{
  rows: GoalRow[];
  accounts: AccountChoice[];
  pay: PaySummary | null;
  // This month across every account a goal follows, each account once.
  thisMonth: { added: number; interest: number; out: number } | null;
  error: boolean;
}> {
  const [{ data: goalRows, error: goalError }, { data: accountRows, error: accountError }, manual, accountSettings, ledger, assetsRes, optionsRes] = await Promise.all([
    admin
      .from("savings_goals")
      .select("id, name, target_amount, saved_amount, target_date, account_refs")
      .order("created_at"),
    // Accounts a goal can follow: money you hold, not cards or loans.
    admin
      .from("accounts")
      .select("id, name, official_name, mask, type, current_balance, apy")
      .eq("is_hidden", false)
      .in("type", ["depository", "investment"])
      .order("name"),
    loadManualAccounts(admin),
    loadAccountSettings(admin),
    loadLedger(admin),
    // Money you track yourself (cash, crypto and the like) can hold a goal too; a car or a house can't.
    admin.from("manual_assets").select("id, name, category, value").eq("is_liability", false).in("category", ["cash", "crypto", "other"]).order("name"),
    admin.from("ui_preferences").select("value").eq("key", GOAL_OPTIONS_KEY).maybeSingle(),
  ]);
  if (assetsRes.error) console.error("Failed to load assets for goals", assetsRes.error);
  if (optionsRes.error) console.error("Failed to load goal options", optionsRes.error);
  const goalOptions = resolveGoalOptions(optionsRes.data?.value);

  if (goalError) console.error("Failed to load savings goals", goalError);
  if (accountError) console.error("Failed to load accounts for goals", accountError);
  if (goalError || accountError || manual.error) return { rows: [], accounts: [], pay: null, thisMonth: null, error: true };

  // Every account a goal can follow, connected or manual, keyed by a ref that
  // says which kind it is. Manual deposit accounts count once a balance is entered.
  const accounts: (AccountChoice & { apy: number | null })[] = [
    ...(accountRows ?? []).map((a) => ({
      id: `plaid:${a.id}`,
      label: `${accountName({ name: a.name as string, official_name: a.official_name as string | null }, accountSettings[a.id as string])}${a.mask ? ` ••${a.mask}` : ""}`,
      balance: a.current_balance === null ? null : Number(a.current_balance),
      apy: a.apy === null ? null : Number(a.apy),
      kind: "account" as const,
    })),
    ...manual.accounts
      .filter((a) => a.type === "depository")
      .map((a) => ({ id: `manual:${a.id}`, label: a.name, balance: a.balanceKnown ? a.balance : null, apy: a.apy, kind: "account" as const })),
    ...(assetsRes.data ?? []).map((a) => ({
      id: `asset:${a.id}`,
      label: a.name as string,
      balance: Number(a.value),
      apy: null,
      kind: "asset" as const,
    })),
  ];
  const balances = new Map(accounts.filter((a) => a.balance !== null).map((a) => [a.id, a.balance as number]));

  const today = calendarNow().isoDate;

  // Each account's posted transactions, by ref, to work its balance back in
  // time and to tell money moved in from interest. A manual account's
  // ledger id is already "manual:<id>".
  const txByRef = new Map<string, GoalAccount["transactions"]>();
  const historyTx = new Map<string, HistoryTx[]>();
  for (const t of ledger.transactions) {
    if (!t.account || t.pending) continue;
    const ref = t.account.id.startsWith("manual:") ? t.account.id : `plaid:${t.account.id}`;
    const date = t.posted_date ?? t.date;
    if (!txByRef.has(ref)) {
      txByRef.set(ref, []);
      historyTx.set(ref, []);
    }
    txByRef.get(ref)!.push({ date, amount: t.amount, interest: t.amount < 0 && isInterest(t), id: t.id, name: humanizeTransactionName(t) });
    historyTx.get(ref)!.push({ date, amount: t.amount });
  }
  const historyStart = historyStartFor(historyTx, today, MAX_HISTORY_DAYS);
  const pay = paySummary(incomeStats(ledger.transactions, ledger.spending, today));
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const rows: GoalRow[] = (goalRows ?? []).map((g) => {
    const refs = (g.account_refs as string[] | null) ?? [];
    const options = goalOptions[g.id as string] ?? DEFAULT_OPTIONS;
    // Each account as it counts toward this goal: all of it, a share, or only its growth.
    const counted = new Map(
      refs.filter((ref) => balances.has(ref)).map((ref) => [ref, countedAccount(ref, balances.get(ref)!, txByRef.get(ref) ?? [], options)])
    );
    const goalBalances = new Map([...counted].map(([ref, c]) => [ref, c.balance]));
    const progress = goalProgress(
      {
        id: g.id,
        name: g.name,
        target_amount: Number(g.target_amount),
        saved_amount: Number(g.saved_amount),
        target_date: g.target_date,
        account_refs: refs,
      },
      today,
      goalBalances
    );
    const followed = refs.filter((ref) => balances.has(ref));
    return {
      ...progress,
      options,
      savedManual: Number(g.saved_amount),
      accountRefs: refs,
      accountNames: followed.map((ref) => byId.get(ref)!.label),
      accountLabels: Object.fromEntries(followed.map((ref) => [ref, byId.get(ref)!.label])),
      insight: goalInsight(
        progress,
        followed.map((ref) => ({
          ref,
          balance: counted.get(ref)!.balance,
          apy: byId.get(ref)?.apy ?? null,
          transactions: counted.get(ref)!.transactions,
        })),
        pay,
        historyStart,
        today
      ),
    };
  });

  const followedRefs = new Set(rows.flatMap((r) => (r.tracksAccount ? r.accountRefs.filter((ref) => balances.has(ref)) : [])));
  const month = today.slice(0, 7);
  const thisMonth = { added: 0, interest: 0, out: 0 };
  for (const ref of followedRefs) {
    for (const t of txByRef.get(ref) ?? []) {
      if (t.date.slice(0, 7) !== month) continue;
      if (t.amount < 0 && t.interest) thisMonth.interest -= t.amount;
      else if (t.amount < 0) thisMonth.added -= t.amount;
      else thisMonth.out += t.amount;
    }
  }
  const cents = (n: number) => Math.round(n * 100) / 100;

  return {
    rows,
    accounts: accounts.map(({ id, label, balance, kind }) => ({ id, label, balance, kind })),
    pay,
    thisMonth: followedRefs.size > 0 ? { added: cents(thisMonth.added), interest: cents(thisMonth.interest), out: cents(thisMonth.out) } : null,
    error: false,
  };
});

/** Today's balance of each account ref ("plaid:", "manual:" or "asset:"), for a growth goal's starting point. */
export async function loadRefBalances(admin: AdminClient, refs: string[]): Promise<Map<string, number>> {
  const ids = (prefix: string) => refs.filter((r) => r.startsWith(prefix)).map((r) => r.slice(prefix.length));
  const plaid = ids("plaid:");
  const assets = ids("asset:");
  const [accountsRes, manual, assetsRes] = await Promise.all([
    plaid.length ? admin.from("accounts").select("id, current_balance").in("id", plaid) : Promise.resolve({ data: [], error: null }),
    ids("manual:").length ? loadManualAccounts(admin) : Promise.resolve({ accounts: [], error: false }),
    assets.length ? admin.from("manual_assets").select("id, value").in("id", assets) : Promise.resolve({ data: [], error: null }),
  ]);
  const out = new Map<string, number>();
  for (const a of accountsRes.data ?? []) if (a.current_balance !== null) out.set(`plaid:${a.id}`, Number(a.current_balance));
  for (const a of manual.accounts) if (a.balanceKnown) out.set(`manual:${a.id}`, a.balance);
  for (const a of assetsRes.data ?? []) out.set(`asset:${a.id}`, Number(a.value));
  return out;
}
