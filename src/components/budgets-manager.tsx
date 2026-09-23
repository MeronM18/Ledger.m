"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Money } from "@/components/money";
import { BUDGETABLE_CATEGORIES, categoryLabel, type BudgetProgress } from "@/lib/budgets";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_BAR: Record<BudgetProgress["status"], string> = {
  ok: "bg-moss",
  warning: "bg-champagne",
  over: "bg-oxblood",
};

export function BudgetBar({ progress, className }: { progress: BudgetProgress; className?: string }) {
  const width = Math.min(progress.percentUsed, 1) * 100;
  return (
    <div
      role="progressbar"
      aria-label={`${progress.label} budget used`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(progress.percentUsed, 1) * 100)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", STATUS_BAR[progress.status])} style={{ width: `${width}%` }} />
    </div>
  );
}

function BudgetDialog({
  trigger,
  existing,
  availableCategories,
  suggestions,
  currency,
}: {
  trigger: React.ReactNode;
  existing?: BudgetProgress;
  availableCategories: string[];
  suggestions: Record<string, number | null>;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) {
      const initial = existing?.category ?? availableCategories[0] ?? "";
      setCategory(initial);
      setAmount(existing ? String(existing.budget) : suggestions[initial] ? String(suggestions[initial]) : "");
    }
    setOpen(next);
  }

  function handleCategoryChange(next: string) {
    setCategory(next);
    // Prefill the suggestion only while the amount is still untouched.
    if (!existing && suggestions[next]) setAmount(String(suggestions[next]));
  }

  async function handleSave() {
    const value = Number(amount);
    if (!category || !Number.isFinite(value) || value <= 0) {
      toast.error("Pick a category and enter an amount greater than 0");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, monthly_amount: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save budget");
      }
      toast.success(existing ? "Budget updated" : "Budget added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save budget");
    } finally {
      setIsSaving(false);
    }
  }

  const suggestion = suggestions[category];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.label} budget` : "Add budget"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {!existing && (
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-amount">Monthly amount</Label>
            <Input
              id="budget-amount"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
            {suggestion ? (
              <button
                type="button"
                className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-champagne hover:underline"
                onClick={() => setAmount(String(suggestion))}
              >
                Suggested {formatCurrency(suggestion, currency)} (average of your last 3 months)
              </button>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving || !category}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BudgetsManager({
  progress,
  unbudgeted,
  suggestions,
  currency,
}: {
  progress: BudgetProgress[];
  unbudgeted: { category: string; label: string; amount: number }[];
  suggestions: Record<string, number | null>;
  currency: string;
}) {
  const router = useRouter();
  const budgeted = new Set(progress.map((p) => p.category));
  const available = BUDGETABLE_CATEGORIES.filter((c) => !budgeted.has(c));

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete budget");
      }
      toast.success("Budget removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete budget");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Category budgets</CardTitle>
          {available.length > 0 && (
            <BudgetDialog
              availableCategories={available}
              suggestions={suggestions}
              currency={currency}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="size-3.5" />
                  Add budget
                </Button>
              }
            />
          )}
        </CardHeader>
        <CardContent className="flex flex-col">
          {progress.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No budgets yet. Add one to see how much of it you&apos;ve used this month.
            </p>
          ) : (
            progress.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: `var(--viz-${p.colorSlot})` }}
                      aria-hidden
                    />
                    {p.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-sm">
                      <Money amount={p.spent} currency={currency} tone="neutral" />
                      <span className="mx-1.5 text-muted-foreground">of</span>
                      <Money amount={p.budget} currency={currency} tone="neutral" />
                    </span>
                    <BudgetDialog
                      existing={p}
                      availableCategories={[p.category]}
                      suggestions={suggestions}
                      currency={currency}
                      trigger={
                        <Button size="icon" variant="ghost" aria-label={`Edit ${p.label} budget`}>
                          <Pencil className="size-3.5" />
                        </Button>
                      }
                    />
                    <Button size="icon" variant="ghost" aria-label={`Delete ${p.label} budget`} onClick={() => handleDelete(p.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </div>
                <BudgetBar progress={p} />
                <p className="text-xs text-muted-foreground">
                  {p.remaining >= 0 ? (
                    <>
                      <span className={p.status === "warning" ? "text-champagne" : "text-moss"}>
                        {formatCurrency(p.remaining, currency)} left
                      </span>
                    </>
                  ) : (
                    <span className="text-oxblood-text">{formatCurrency(-p.remaining, currency)} over</span>
                  )}
                  {p.projectedOver && p.projected !== null && (
                    <span className="text-champagne">
                      {" "}
                      · on pace for {formatCurrency(p.projected, currency)} by month end
                    </span>
                  )}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {unbudgeted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Spending without a budget</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {unbudgeted.map((c) => (
              <div
                key={c.category}
                className="flex items-center justify-between border-t border-border py-2 first:border-t-0 first:pt-0"
              >
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <span className="flex items-center gap-3">
                  <Money amount={c.amount} currency={currency} tone="negative" className="text-sm font-medium" />
                  {available.includes(c.category as (typeof available)[number]) && (
                    <BudgetDialog
                      availableCategories={[c.category]}
                      suggestions={suggestions}
                      currency={currency}
                      trigger={
                        <Button size="sm" variant="ghost">
                          Set budget
                        </Button>
                      }
                    />
                  )}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
