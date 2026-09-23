import { GoalsManager, type AccountChoice, type GoalRow } from "@/components/goals-manager";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent } from "@/components/ui/card";
import { goalProgress, goalsSummary } from "@/lib/goals";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

export default async function GoalsPage() {
  const admin = createAdminClient();

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

  if (goalError || accountError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>
        <QueryErrorState message="Couldn't load your goals. Try refreshing the page." />
      </div>
    );
  }

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
  const summary = goalsSummary(rows);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>

      {rows.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">Saved across your goals</p>
              <p className="text-2xl font-semibold">
                <Money amount={summary.saved} currency="USD" tone="positive" />
                <span className="mx-2 text-base font-normal text-muted-foreground">of</span>
                <Money amount={summary.target} currency="USD" tone="neutral" />
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {summary.completed} of {rows.length} reached
            </p>
          </CardContent>
        </Card>
      )}

      <GoalsManager goals={rows} accounts={accounts} currency="USD" />
    </div>
  );
}
