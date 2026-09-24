import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DragHandle } from "@/components/sortable-card-list";
import { ALERT_THRESHOLDS } from "@/lib/config";
import { loadForecast } from "@/lib/forecast-data";
import { formatCurrency } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SafeToSpendSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
}

/**
 * Async server component, meant to sit inside <Suspense>: it does its own
 * loading, so the rest of the overview renders without waiting on it.
 */
export async function SafeToSpendCard() {
  const data = await loadForecast(createAdminClient());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <DragHandle />
          <CardTitle className="text-sm font-medium text-muted-foreground">Safe to spend</CardTitle>
        </div>
        <Link
          href="/cash-flow"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne"
        >
          Cash flow <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {data.error ? (
          <QueryErrorState message="Couldn't load cash flow." />
        ) : !data.hasCashAccount ? (
          <p className="text-sm text-muted-foreground">Connect a checking account to see what&apos;s safe to spend.</p>
        ) : (
          <>
            <Money
              amount={data.forecast.safeToSpend}
              currency={data.currency}
              tone={data.forecast.safeToSpend >= 0 ? "positive" : "negative"}
              className="text-3xl font-semibold"
            />
            <p className="text-sm text-muted-foreground">
              {data.forecast.nextIncome
                ? `until your ${shortDate(data.forecast.nextIncome.date)} paycheck`
                : `over the next ${data.forecast.daysToPayday} days`}
              {data.forecast.perDay !== null && data.forecast.safeToSpend > 0
                ? ` · about ${formatCurrency(data.forecast.perDay, data.currency)} a day`
                : ""}
            </p>
            {data.forecast.firstBelowThreshold && (
              <p className="text-sm text-champagne">
                Balance projected to dip under {formatCurrency(ALERT_THRESHOLDS.lowBalance, data.currency)} on{" "}
                {shortDate(data.forecast.firstBelowThreshold.date)}.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
