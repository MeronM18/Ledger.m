import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CardRewards } from "@/lib/card-rewards";
import { formatCurrency } from "@/lib/format";

const fmt = (unit: "points" | "cash", n: number) => (unit === "points" ? `${Math.round(n).toLocaleString("en-US")} pts` : formatCurrency(n, "USD"));
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * What each rewards card has earned this month and this year, and where it
 * came from; for Freedom Flex, this quarter's 5% categories and how much of
 * the $1,500 is used. Estimated from each purchase's category.
 */
export function RewardsCard({ cards, monthLabel }: { cards: CardRewards[]; monthLabel: string }) {
  if (cards.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rewards</CardTitle>
        <p className="text-xs text-muted-foreground">Estimated from each purchase&apos;s category, at each card&apos;s current rates.</p>
      </CardHeader>
      <CardContent className="flex flex-col">
        {cards.map((c) => (
          <div key={c.accountId} className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <Link
                href={`/transactions?account=${encodeURIComponent(c.accountId)}`}
                className="min-w-0 truncate font-medium transition-colors hover:text-champagne"
                title={`See ${c.name}'s transactions`}
              >
                {c.name}
              </Link>
              <span className="shrink-0 font-mono text-champagne tabular-nums">{fmt(c.unit, c.thisMonth)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {monthLabel} so far · <span className="font-mono tabular-nums">{fmt(c.unit, c.thisYear)}</span> this year
              {c.unit === "points" && c.thisYear > 0 ? ` (about ${formatCurrency(c.thisYear / 100, "USD")} as cash back)` : ""}
            </p>
            {c.byWhy.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground" aria-label={`Where ${c.name}'s rewards came from this year`}>
                {c.byWhy.slice(0, 3).map((w) => (
                  <li key={w.why}>
                    {w.why} <span className="font-mono text-foreground/80 tabular-nums">{fmt(c.unit, w.earned)}</span>
                  </li>
                ))}
              </ul>
            )}
            {c.quarter && c.quarter.categories.length > 0 && (
              <div className="mt-1 flex flex-col gap-1.5 rounded-md bg-muted/50 px-3 py-2.5">
                <p className="text-xs">
                  <span className="font-medium">5% until {shortDate(c.quarter.ends)}:</span>{" "}
                  <span className="text-muted-foreground">{c.quarter.categories.join(", ")}</span>
                </p>
                <div
                  role="progressbar"
                  aria-label={`${c.name} 5% categories used this quarter`}
                  aria-valuemin={0}
                  aria-valuemax={c.quarter.cap}
                  aria-valuenow={Math.round(c.quarter.used)}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-champagne" style={{ width: `${Math.min(1, c.quarter.used / c.quarter.cap) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{formatCurrency(c.quarter.used, "USD")}</span> of{" "}
                  {formatCurrency(c.quarter.cap, "USD")} spent at 5%. Activate each quarter in the Chase app.
                </p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
