import { BudgetsManager } from "@/components/budgets-manager";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import {
  BUDGETABLE_CATEGORIES,
  budgetProgress,
  budgetTotals,
  daysInMonth,
  suggestBudget,
  unbudgetedSpending,
  type Budget,
} from "@/lib/budgets";
import { categoryTotalsForMonth } from "@/lib/spending-aggregation";
import { loadSpendingData } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

export default async function BudgetsPage() {
  const admin = createAdminClient();

  const [data, { data: budgetRows, error: budgetError }] = await Promise.all([
    loadSpendingData(admin),
    admin.from("budgets").select("id, category, monthly_amount"),
  ]);

  if (budgetError) console.error("Failed to load budgets", budgetError);

  if (data.error || budgetError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Budgets</h1>
        <QueryErrorState message="Couldn't load your budgets. Try refreshing the page." />
      </div>
    );
  }

  const budgets: Budget[] = (budgetRows ?? []).map((b) => ({
    id: b.id,
    category: b.category,
    monthly_amount: Number(b.monthly_amount),
  }));

  const now = calendarNow();
  const categoryTotals = categoryTotalsForMonth(data.spending, now.year, now.month);
  const progress = budgetProgress(categoryTotals, budgets, now);
  const totals = budgetTotals(progress);
  const unbudgeted = unbudgetedSpending(categoryTotals, budgets);

  const suggestions: Record<string, number | null> = {};
  for (const category of BUDGETABLE_CATEGORIES) {
    suggestions[category] = suggestBudget(data.spending, category, now);
  }

  const dayOfMonth = Number(now.isoDate.slice(8, 10));
  const daysLeft = daysInMonth(now.year, now.month) - dayOfMonth;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Budgets</h1>

      {progress.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs text-muted-foreground">{now.monthLabel} · {daysLeft} days left</p>
              <p className="mt-1 text-sm text-muted-foreground">Budgeted categories</p>
              <p className="text-2xl font-semibold">
                <Money amount={totals.spent} currency={data.currency} tone="neutral" />
                <span className="mx-2 text-base font-normal text-muted-foreground">of</span>
                <Money amount={totals.budget} currency={data.currency} tone="neutral" />
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{totals.remaining >= 0 ? "Left to spend" : "Over budget by"}</p>
              <Money
                amount={Math.abs(totals.remaining)}
                currency={data.currency}
                tone={totals.remaining >= 0 ? "positive" : "negative"}
                className="text-2xl font-semibold"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <BudgetsManager
        progress={progress}
        unbudgeted={unbudgeted.map((c) => ({ category: c.category, label: c.label, amount: c.amount }))}
        suggestions={suggestions}
        currency={data.currency}
      />
    </div>
  );
}
