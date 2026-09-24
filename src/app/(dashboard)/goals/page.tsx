import { GoalsManager, NewGoalButton } from "@/components/goals-manager";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent } from "@/components/ui/card";
import { dollars } from "@/lib/goal-copy";
import { goalsSummary } from "@/lib/goals";
import { loadGoals } from "@/lib/goals-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const { rows, accounts, pay, error } = await loadGoals(createAdminClient());
  const today = calendarNow().isoDate;

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>
        <QueryErrorState message="Couldn't load your goals. Try refreshing the page." />
      </div>
    );
  }

  const summary = goalsSummary(rows);
  // What every dated goal needs a month, together, and that as a share of pay.
  const plans = rows.flatMap((g) => (g.insight.plan ? [g.insight.plan.perMonth] : []));
  const monthly = plans.reduce((s, v) => s + v, 0);
  const share = pay?.typicalMonth && monthly > 0 ? monthly / pay.typicalMonth : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-center justify-between gap-3 md:pr-12">
        <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>
        {rows.length > 0 && <NewGoalButton accounts={accounts} pay={pay} today={today} />}
      </div>

      {/* With one goal its own panel says it all; with several, the sum of them. */}
      {rows.length > 1 && (
        <Card>
          <CardContent className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Money amount={summary.saved} currency="USD" tone="neutral" className="text-xl font-semibold" />
              <span className="text-muted-foreground">
                saved of <Money amount={summary.target} currency="USD" tone="neutral" /> across {rows.length} goals
              </span>
            </p>
            <p className="text-muted-foreground">
              {plans.length > 0 && monthly > 0 && (
                <>
                  Together they need <span className="font-mono text-foreground tabular-nums">{dollars(monthly)}</span> a month
                  {share !== null ? `, about ${Math.round(share * 100)}% of your pay` : ""}.{" "}
                </>
              )}
              {summary.completed} of {rows.length} reached.
            </p>
          </CardContent>
        </Card>
      )}

      <GoalsManager goals={rows} accounts={accounts} pay={pay} today={today} />
    </div>
  );
}
