import "server-only";
import type { AccountChoice, GoalRow } from "@/components/goals-manager";
import { goalProgress } from "@/lib/goals";
import { prettyName } from "@/lib/transaction-display";
import type { createAdminClient } from "@/lib/supabase/admin";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { calendarNow } from "@/lib/time";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Every savings goal with its progress, plus the accounts a goal can follow. Shared by /goals and the overview. */
export async function loadGoals(
  admin: AdminClient
): Promise<{ rows: GoalRow[]; accounts: AccountChoice[]; error: boolean }> {
  const [{ data: goalRows, error: goalError }, { data: accountRows, error: accountError }, manual] = await Promise.all([
    admin
      .from("savings_goals")
      .select("id, name, target_amount, saved_amount, target_date, account_refs")
      .order("created_at"),
    // Accounts a goal can follow: money you hold, not cards or loans.
    admin
      .from("accounts")
      .select("id, name, mask, type, current_balance")
      .eq("is_hidden", false)
      .in("type", ["depository", "investment"])
      .order("name"),
    loadManualAccounts(admin),
  ]);

  if (goalError) console.error("Failed to load savings goals", goalError);
  if (accountError) console.error("Failed to load accounts for goals", accountError);
  if (goalError || accountError || manual.error) return { rows: [], accounts: [], error: true };

  // Every account a goal can follow, connected or manual, keyed by a ref that
  // says which kind it is. Manual deposit accounts count once a balance is entered.
  const balances = new Map<string, number>([
    ...(accountRows ?? [])
      .filter((a) => a.current_balance !== null)
      .map((a) => [`plaid:${a.id}`, Number(a.current_balance)] as [string, number]),
    ...manual.accounts
      .filter((a) => a.type === "depository" && a.balanceKnown)
      .map((a) => [`manual:${a.id}`, a.balance] as [string, number]),
  ]);
  const accounts: AccountChoice[] = [
    ...(accountRows ?? []).map((a) => ({
      id: `plaid:${a.id}`,
      label: `${prettyName(a.name as string)}${a.mask ? ` ••${a.mask}` : ""}`,
    })),
    ...manual.accounts
      .filter((a) => a.type === "depository")
      .map((a) => ({ id: `manual:${a.id}`, label: a.name })),
  ];

  const today = calendarNow().isoDate;
  const rows: GoalRow[] = (goalRows ?? []).map((g) => ({
    ...goalProgress(
      {
        id: g.id,
        name: g.name,
        target_amount: Number(g.target_amount),
        saved_amount: Number(g.saved_amount),
        target_date: g.target_date,
        account_refs: (g.account_refs as string[] | null) ?? [],
      },
      today,
      balances
    ),
    savedManual: Number(g.saved_amount),
    accountRefs: (g.account_refs as string[] | null) ?? [],
  }));

  return { rows, accounts, error: false };
}
