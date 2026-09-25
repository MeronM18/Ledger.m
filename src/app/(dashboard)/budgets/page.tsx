import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BudgetBoard } from "@/components/budget-board";
import { QueryErrorState } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import {
  BUDGETABLE_CATEGORIES,
  budgetMonth,
  budgetPlan,
  budgetProgress,
  budgetTips,
  categoryLabel,
  merchantsByCategory,
  monthCategorySpending,
  shiftBudgetMonth,
  type Budget,
} from "@/lib/budgets";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { loadMonthlyBudget } from "@/lib/ui-preferences";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const admin = createAdminClient();

  const [ledger, { data: budgetRows, error: budgetError }, total, params] = await Promise.all([
    loadLedger(admin),
    admin.from("budgets").select("id, category, monthly_amount"),
    loadMonthlyBudget(admin),
    searchParams,
  ]);

  if (budgetError) console.error("Failed to load budgets", budgetError);

  if (ledger.error || budgetError || total.error) {
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
  // The month's spending, net, grouped the way Spending groups it.
  const categorySpending = monthCategorySpending(ledger.spending, month.year, month.month);
  const rows = budgetProgress(categorySpending, budgets, month);
  const plan = budgetPlan(categorySpending, budgets, total.amount, month);
  const merchants = merchantsByCategory(ledger.spending, month.key);
  const tips = budgetTips(rows, plan, month, merchants);

  // Categories you could give a budget: ones with spending this month first.
  const taken = new Set([...budgets.map((b) => b.category), ...plan.unbudgeted.map((u) => u.category)]);
  const others = BUDGETABLE_CATEGORIES.filter((c) => !taken.has(c)).map((c) => ({ category: c, label: categoryLabel(c) }));

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

      <BudgetBoard month={month} rows={rows} plan={plan} budgets={budgets} merchants={merchants} others={others} tips={tips} />
    </div>
  );
}
