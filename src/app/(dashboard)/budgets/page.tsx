import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BudgetBoard } from "@/components/budget-board";
import { QueryErrorState } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import {
  BUDGETABLE_CATEGORIES,
  budgetMonth,
  budgetProgress,
  budgetTips,
  categoryLabel,
  incomeForMonth,
  shiftBudgetMonth,
  suggestBudget,
  typicalIncome,
  unbudgetedSpending,
  type Budget,
} from "@/lib/budgets";
import { categoryTotalsForMonth } from "@/lib/spending-aggregation";
import { loadSpendingData } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const admin = createAdminClient();

  const [data, { data: budgetRows, error: budgetError }, params] = await Promise.all([
    loadSpendingData(admin),
    admin.from("budgets").select("id, category, monthly_amount"),
    searchParams,
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

  const today = calendarNow();
  const month = budgetMonth(typeof params.month === "string" ? params.month : undefined, today.isoDate);
  const categoryTotals = categoryTotalsForMonth(data.spending, month.year, month.month);
  const progress = budgetProgress(categoryTotals, budgets, month);
  const unbudgeted = unbudgetedSpending(categoryTotals, budgets).map((c) => ({ category: c.category, label: c.label, amount: c.amount }));

  // Suggestions look back from the month shown: its three before.
  const suggestions: Record<string, number | null> = {};
  for (const category of BUDGETABLE_CATEGORIES) {
    suggestions[category] = suggestBudget(data.spending, category, month);
  }

  const taken = new Set([...budgets.map((b) => b.category), ...unbudgeted.map((u) => u.category)]);
  const others = BUDGETABLE_CATEGORIES.filter((c) => !taken.has(c)).map((c) => ({ category: c, label: categoryLabel(c) }));

  const income = { typical: typicalIncome(data.all, month.key), actual: incomeForMonth(data.all, month.key) };
  const tips = budgetTips(progress, unbudgeted, suggestions, month);

  const prev = shiftBudgetMonth(month.key, -1);
  const next = month.isCurrent ? null : shiftBudgetMonth(month.key, 1);
  const hrefFor = (key: string) => (key === today.isoDate.slice(0, 7) ? "/budgets" : `/budgets?month=${key}`);

  return (
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-center justify-between gap-3 md:pr-12">
        <div className="flex items-baseline gap-4">
          <h1 className="font-serif text-2xl font-semibold text-bone">Budgets</h1>
          <span className="text-base text-muted-foreground">{month.label}</span>
        </div>
        <nav aria-label="Month" className="flex items-center gap-1.5">
          <Button asChild size="icon-sm" variant="ghost" aria-label="Previous month">
            <Link href={hrefFor(prev)}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          {next ? (
            <Button asChild size="icon-sm" variant="ghost" aria-label="Next month">
              <Link href={hrefFor(next)}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button size="icon-sm" variant="ghost" aria-label="Next month" disabled>
              <ChevronRight className="size-4" />
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className={month.isCurrent ? "pointer-events-none opacity-50" : undefined}>
            <Link href="/budgets" aria-disabled={month.isCurrent}>
              Today
            </Link>
          </Button>
        </nav>
      </div>

      <BudgetBoard
        month={month}
        income={income}
        rows={progress}
        unbudgeted={unbudgeted}
        others={others}
        suggestions={suggestions}
        tips={tips}
      />
    </div>
  );
}
