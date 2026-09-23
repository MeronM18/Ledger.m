import { GoalsManager } from "@/components/goals-manager";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent } from "@/components/ui/card";
import { goalsSummary } from "@/lib/goals";
import { loadGoals } from "@/lib/goals-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const { rows, accounts, error } = await loadGoals(createAdminClient());

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>
        <QueryErrorState message="Couldn't load your goals. Try refreshing the page." />
      </div>
    );
  }

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
