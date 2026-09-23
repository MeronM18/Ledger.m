import "server-only";
import type { AccountChoice, GoalRow } from "@/components/goals-manager";
import { goalProgress } from "@/lib/goals";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Every savings goal with its progress, plus the accounts a goal can follow. Shared by /goals and the overview. */
export async function loadGoals(
  admin: AdminClient
): Promise<{ rows: GoalRow[]; accounts: AccountChoice[]; error: boolean }> {
  const [{ data: goalRows, error: goalError }, { data: accountRows, error: accountError }] = await Promise.all([
    admin
      .from("savings_goals")
      .select("id, name, target_amount, saved_amount, target_date, account_id")
      .order("created_at"),
    // Accounts a goal can follow: money you hold, not cards or loans.
    admin
      .from("accounts")
      .select("id, name, mask, type, current_balance")
      .eq("is_hidden", false)
      .in("type", ["depository", "investment"])
      .order("name"),
  ]);

  if (goalError) console.error("Failed to load savings goals", goalError);
  if (accountError) console.error("Failed to load accounts for goals", accountError);
  if (goalError || accountError) return { rows: [], accounts: [], error: true };

  const balances = new Map<string, number>(
    (accountRows ?? []).filter((a) => a.current_balance !== null).map((a) => [a.id as string, Number(a.current_balance)])
  );
  const accounts: AccountChoice[] = (accountRows ?? []).map((a) => ({
    id: a.id as string,
    label: `${a.name}${a.mask ? ` ••${a.mask}` : ""}`,
  }));

  const today = calendarNow().isoDate;
  const rows: GoalRow[] = (goalRows ?? []).map((g) => ({
    ...goalProgress(
      {
        id: g.id,
        name: g.name,
        target_amount: Number(g.target_amount),
        saved_amount: Number(g.saved_amount),
        target_date: g.target_date,
        account_id: g.account_id,
      },
      today,
      balances
    ),
    savedManual: Number(g.saved_amount),
    accountId: g.account_id,
  }));

  return { rows, accounts, error: false };
}
