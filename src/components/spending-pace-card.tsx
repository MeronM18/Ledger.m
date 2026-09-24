import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DragHandle } from "@/components/sortable-card-list";
import { formatCurrency } from "@/lib/format";
import { dailyAverage, type MonthRef, type Pace } from "@/lib/trends";
import { cn } from "@/lib/utils";

function Bar({ label, amount, max, tone, currency }: { label: string; amount: number; max: number; tone: string; currency: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{formatCurrency(amount, currency)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${max > 0 ? Math.max(0, Math.min(1, amount / max)) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/**
 * This month's spending against last month at the same day, as two bars and
 * one sentence. The detail (chart, categories) lives on /spending.
 */
export function SpendingPaceCard({
  pace,
  monthRef,
  previousMonthName,
  currency,
  error,
}: {
  pace: Pace;
  monthRef: MonthRef;
  previousMonthName: string;
  currency: string;
  error: boolean;
}) {
  const daily = dailyAverage(pace, monthRef);
  const max = Math.max(pace.current, pace.previousSamePoint, 1);
  const less = pace.delta < 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <DragHandle />
          <CardTitle className="text-sm font-medium text-muted-foreground">Spending pace</CardTitle>
        </div>
        <Link
          href="/reports/spending"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne"
        >
          Spending <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p className="text-sm text-oxblood-text">Couldn&apos;t load spending.</p>
        ) : !pace.hasPrevious ? (
          <p className="text-sm text-muted-foreground">
            {formatCurrency(pace.current, currency)} spent so far this month. A comparison shows up once there&apos;s a
            full earlier month.
          </p>
        ) : (
          <>
            <Bar label="This month" amount={pace.current} max={max} tone={less ? "bg-moss" : "bg-oxblood"} currency={currency} />
            <Bar
              label={`${previousMonthName}, by day ${pace.throughDay}`}
              amount={pace.previousSamePoint}
              max={max}
              tone="bg-muted-foreground/50"
              currency={currency}
            />
            <p className="text-sm text-muted-foreground">
              {pace.delta === 0 ? (
                "Right on last month's pace."
              ) : (
                <>
                  <span className={cn("font-medium", less ? "text-moss" : "text-oxblood-text")}>
                    {formatCurrency(Math.abs(pace.delta), currency)} {less ? "less" : "more"}
                  </span>{" "}
                  than {previousMonthName} at this point.
                </>
              )}
            </p>
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">{formatCurrency(daily.current, currency)}</span> a day
              {daily.previous !== null && (
                <>
                  {" "}
                  vs <span className="font-mono tabular-nums">{formatCurrency(daily.previous, currency)}</span> in {previousMonthName}
                </>
              )}
              {daily.projectedMonthTotal !== null && <>, on pace for {formatCurrency(daily.projectedMonthTotal, currency)} this month</>}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
