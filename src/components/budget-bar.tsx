import type { BudgetProgress } from "@/lib/budgets";
import { cn } from "@/lib/utils";

const STATUS_BAR: Record<BudgetProgress["status"], string> = {
  ok: "bg-moss",
  warning: "bg-champagne",
  over: "bg-oxblood",
};

export function BudgetBar({ progress, className }: { progress: BudgetProgress; className?: string }) {
  const over = progress.status === "over";
  // Within budget the bar is the share used. Over budget it is scaled to the
  // amount actually spent: the part up to the budget in a softer red, the
  // excess in full red, so $200 spent against a $20 budget doesn't look the
  // same as $22 against $20.
  const budgetShare = over && progress.spent > 0 ? (progress.budget / progress.spent) * 100 : 100;
  const width = Math.min(progress.percentUsed, 1) * 100;

  return (
    <div
      role="progressbar"
      aria-label={`${progress.label} budget used`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(progress.percentUsed, 1) * 100)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {over ? (
        <>
          <div className="absolute inset-y-0 left-0 bg-oxblood" style={{ width: "100%" }} />
          <div className="absolute inset-y-0 left-0 bg-oxblood/45" style={{ width: `${budgetShare}%` }} />
          <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${budgetShare}%` }} aria-hidden />
        </>
      ) : (
        <div className={cn("h-full rounded-full transition-[width]", STATUS_BAR[progress.status])} style={{ width: `${width}%` }} />
      )}
    </div>
  );
}
