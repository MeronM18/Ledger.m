import "server-only";
import { accountName } from "@/lib/account-settings";
import { MAX_HISTORY_DAYS, type HistoryTx } from "@/lib/account-history";
import { historyStartFor } from "@/lib/accounts-board";
import { loadAccountSettings } from "@/lib/ui-preferences";
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
export async function loadGoals(
  admin: AdminClient
): Promise<{
  rows: GoalRow[];
  accounts: AccountChoice[];
  pay: PaySummary | null;
  // This month across every account a goal follows, each account once.
  thisMonth: { added: number; interest: number; out: number } | null;
  error: boolean;
}> {
  const [{ data: goalRows, error: goalError }, { data: accountRows, error: accountError }, manual, accountSettings, ledger] = await Promise.all([
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
  ]);

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
    })),
    ...manual.accounts
      .filter((a) => a.type === "depository")
      .map((a) => ({ id: `manual:${a.id}`, label: a.name, balance: a.balanceKnown ? a.balance : null, apy: a.apy })),
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
      balances
    );
    const followed = refs.filter((ref) => balances.has(ref));
    return {
      ...progress,
      savedManual: Number(g.saved_amount),
      accountRefs: refs,
      accountNames: followed.map((ref) => byId.get(ref)!.label),
      accountLabels: Object.fromEntries(followed.map((ref) => [ref, byId.get(ref)!.label])),
      insight: goalInsight(
        progress,
        followed.map((ref) => ({
          ref,
          balance: balances.get(ref)!,
          apy: byId.get(ref)?.apy ?? null,
          transactions: txByRef.get(ref) ?? [],
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
    accounts: accounts.map(({ id, label, balance }) => ({ id, label, balance })),
    pay,
    thisMonth: followedRefs.size > 0 ? { added: cents(thisMonth.added), interest: cents(thisMonth.interest), out: cents(thisMonth.out) } : null,
    error: false,
  };
}
