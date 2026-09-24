import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { QueryErrorState } from "@/components/query-error";
import { DragHandle } from "@/components/sortable-card-list";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { sparklinePath, type NetWorthTrend } from "@/lib/net-worth-trend";
import { cn } from "@/lib/utils";

const SPARK_W = 320;
const SPARK_H = 72;

/**
 * The overview's headline: net worth, how much it moved over the last 30
 * days, and a sparkline of the last ~90. Server-rendered inline SVG, so the
 * top of the page needs no client JavaScript.
 */
export function NetWorthHero({
  netWorth,
  trend,
  error,
  currency,
}: {
  netWorth: number;
  trend: NetWorthTrend;
  error: boolean;
  currency: string;
}) {
  const path = sparklinePath(trend.values, SPARK_W, SPARK_H, 3);
  const up = trend.change !== null && trend.change >= 0;

  return (
    <Card className="border-champagne/40">
      <CardContent className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {error ? (
          <QueryErrorState message="Couldn't load net worth." />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <DragHandle />
                <span className="mr-1 text-sm font-medium text-muted-foreground">Net worth</span>
                <Link
                  href="/assets"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne"
                >
                  Details <ArrowRight className="size-3" />
                </Link>
              </div>
              <span
                className={cn(
                  "font-serif text-4xl font-semibold tabular-nums",
                  netWorth < 0 ? "text-oxblood-text" : "text-moss"
                )}
              >
                {formatCurrency(netWorth, currency)}
              </span>
              {trend.change !== null && (
                <p className={cn("flex items-center gap-1.5 text-sm", up ? "text-moss" : "text-oxblood-text")}>
                  {up ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}
                  <span className="font-mono tabular-nums">
                    {up ? "+" : "-"}
                    {formatCurrency(Math.abs(trend.change), currency)}
                    {trend.changePct !== null ? ` (${up ? "+" : "-"}${Math.abs(trend.changePct * 100).toFixed(1)}%)` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {trend.since
                      ? `since ${new Date(`${trend.since}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
                      : "in the last 30 days"}
                  </span>
                </p>
              )}
            </div>

            {path && (
              <svg
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Net worth over the last three months"
                className="h-[72px] w-full md:w-1/2"
              >
                <path
                  d={path}
                  fill="none"
                  stroke="var(--champagne)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
