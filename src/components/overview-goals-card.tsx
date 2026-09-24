import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DragHandle } from "@/components/sortable-card-list";
import { formatCurrency } from "@/lib/format";
import { loadGoals } from "@/lib/goals-data";
import { createAdminClient } from "@/lib/supabase/admin";

export function OverviewGoalsSkeleton() {
  return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
}

/** Async server component for <Suspense>: loads its own data so it never delays the rest of the overview. */
export async function OverviewGoalsCard() {
  const { rows, error } = await loadGoals(createAdminClient());

  // Unfinished goals first, closest to done first; reached goals only fill any spare rows.
  const shown = [...rows]
    .sort((a, b) => Number(a.status === "complete") - Number(b.status === "complete") || b.percent - a.percent)
    .slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <DragHandle />
          <CardTitle>Goals</CardTitle>
        </div>
        <Link
          href="/goals"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne"
        >
          View all <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <QueryErrorState message="Couldn't load goals." />
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No savings goals yet.{" "}
            <Link href="/goals" className="text-champagne hover:underline">
              Set one up
            </Link>
            .
          </p>
        ) : (
          shown.map((g) => (
            <div key={g.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground">
                  {formatCurrency(g.saved, "USD")} of {formatCurrency(g.target, "USD")}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${g.name} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(g.percent * 100)}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={g.status === "complete" ? "h-full rounded-full bg-moss" : "h-full rounded-full bg-champagne"}
                  style={{ width: `${g.percent * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
