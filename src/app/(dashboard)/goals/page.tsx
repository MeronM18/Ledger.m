import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GoalsManager, NewGoalButton } from "@/components/goals-manager";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent } from "@/components/ui/card";
import { monthCategorySpending } from "@/lib/budgets";
import { dollars } from "@/lib/goal-copy";
import { goalsSummary } from "@/lib/goals";
import { loadGoals } from "@/lib/goals-data";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { loadMonthlyBudget } from "@/lib/ui-preferences";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const admin = createAdminClient();
  const [{ rows, accounts, pay, thisMonth, error }, ledger, monthlyBudget] = await Promise.all([
    loadGoals(admin),
    // Shared with loadGoals (the same request), so not a second read.
    loadLedger(admin),
    loadMonthlyBudget(admin),
  ]);
  const now = calendarNow();
  const today = now.isoDate;

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
  const plans = rows.flatMap((g) => (g.insight.plan && g.status !== "complete" ? [g.insight.plan.perMonth] : []));
  const monthly = plans.reduce((s, v) => s + v, 0);
  const share = pay?.typicalMonth && monthly > 0 ? monthly / pay.typicalMonth : null;
  const moved = thisMonth ? Math.round((thisMonth.added - thisMonth.out) * 100) / 100 : null;
  const monthName = now.monthLabel.split(" ")[0];

  // Spending this month against the monthly budget: what's kept from spending is what can go to goals.
  const spent = ledger.error ? null : Math.round(monthCategorySpending(ledger.spending, now.year, now.month).reduce((s, c) => s + c.amount, 0) * 100) / 100;
  const budget = monthlyBudget.amount;

  return (
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-center justify-between gap-3 md:pr-12">
        <h1 className="font-serif text-2xl font-semibold text-bone">Goals</h1>
        {rows.length > 0 && <NewGoalButton accounts={accounts} pay={pay} today={today} />}
      </div>

      {rows.length > 0 && (
        <Card>
          <CardContent className="grid gap-5 text-sm md:grid-cols-3 md:divide-x md:divide-border">
            <div className="flex flex-col gap-1 md:pr-5">
              <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Saved</span>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Money amount={summary.saved} currency="USD" tone="neutral" className="text-xl font-semibold" />
                <span className="text-muted-foreground">
                  of <Money amount={summary.target} currency="USD" tone="neutral" />
                </span>
              </p>
              <span className="text-xs text-muted-foreground">
                {summary.completed} of {rows.length} {rows.length === 1 ? "goal" : "goals"} reached
              </span>
            </div>

            <div className="flex flex-col gap-1 md:px-5">
              <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{monthName} so far</span>
              {moved === null ? (
                <span className="text-muted-foreground">Follow the accounts a goal sits in to see what goes in each month.</span>
              ) : (
                <>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`font-mono text-xl font-semibold tabular-nums ${moved < 0 ? "text-oxblood-text" : "text-bone"}`}>
                      {moved < 0 ? "−" : ""}
                      {dollars(Math.abs(moved))}
                    </span>
                    <span className="text-muted-foreground">{moved < 0 ? "taken out" : "moved in"}</span>
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {thisMonth!.interest >= 0.5 ? `plus ${dollars(thisMonth!.interest)} interest` : "no interest yet"}
                    {plans.length > 0 && monthly > 0 && (
                      <>
                        {" · "}your dated goals need {dollars(monthly)} a month{share !== null ? `, about ${Math.round(share * 100)}% of pay` : ""}
                      </>
                    )}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1 md:pl-5">
              <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Spending</span>
              {spent === null ? (
                <span className="text-muted-foreground">Couldn&apos;t load this month&apos;s spending.</span>
              ) : budget === null ? (
                <>
                  <Money amount={spent} currency="USD" tone="neutral" className="text-xl font-semibold" />
                  <Link href="/budgets" className="inline-flex items-center gap-1 text-xs text-champagne hover:underline">
                    Set a monthly budget to keep more for your goals <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </>
              ) : (
                <>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`font-mono text-xl font-semibold tabular-nums ${spent > budget ? "text-oxblood-text" : "text-bone"}`}>{dollars(Math.abs(budget - spent))}</span>
                    <span className="text-muted-foreground">{spent > budget ? "over budget" : "left in your budget"}</span>
                  </p>
                  <Link href="/budgets" className="inline-flex items-center gap-1 text-xs text-champagne hover:underline">
                    {dollars(spent)} spent of {dollars(budget)}: see Budgets <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <GoalsManager goals={rows} accounts={accounts} pay={pay} today={today} />
    </div>
  );
}
