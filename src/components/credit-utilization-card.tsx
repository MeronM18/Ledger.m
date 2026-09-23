import { Money } from "@/components/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cardLabel,
  GOOD_UTILIZATION,
  type UtilizationBand,
  type UtilizationSummary,
} from "@/lib/credit-utilization";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAND_LABEL: Record<UtilizationBand, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  high: "High",
};
const BAND_TEXT: Record<UtilizationBand, string> = {
  excellent: "text-moss",
  good: "text-moss",
  fair: "text-champagne",
  high: "text-oxblood-text",
};
const BAND_BAR: Record<UtilizationBand, string> = {
  excellent: "bg-moss",
  good: "bg-moss",
  fair: "bg-champagne",
  high: "bg-oxblood",
};

function pct(u: number): string {
  return `${Math.round(u * 100)}%`;
}

// The bar's track is 0-100% of the limit; the tick marks the 30% guideline.
function UtilizationBar({ utilization, band, label }: { utilization: number; band: UtilizationBand; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={`${label} utilization`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(utilization, 1) * 100)}
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={cn("h-full rounded-full", BAND_BAR[band])} style={{ width: `${Math.min(utilization, 1) * 100}%` }} />
      <div
        className="absolute inset-y-0 w-px bg-foreground/50"
        style={{ left: `${GOOD_UTILIZATION * 100}%` }}
        aria-hidden
      />
    </div>
  );
}

export function CreditUtilizationCard({ summary, currency }: { summary: UtilizationSummary; currency: string }) {
  if (summary.cards.length === 0 && summary.unrated.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit utilization</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {summary.overall !== null && summary.overallBand !== null ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p>
                <span className={cn("font-mono text-3xl font-semibold tabular-nums", BAND_TEXT[summary.overallBand])}>
                  {pct(summary.overall)}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  of your limits · {BAND_LABEL[summary.overallBand]}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(summary.totalBalance, currency)} of {formatCurrency(summary.totalLimit, currency)}
              </p>
            </div>
            <UtilizationBar utilization={summary.overall} band={summary.overallBand} label="Overall" />
            <p className="text-xs text-muted-foreground">
              {summary.overallPayDownToGood > 0
                ? `Paying down ${formatCurrency(summary.overallPayDownToGood, currency)} would bring you under 30%, the usual guideline.`
                : "You're under 30%, the usual guideline. Under 10% is the strongest range."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            None of your cards reports a credit limit, so utilization can&apos;t be calculated.
          </p>
        )}

        {summary.cards.length > 0 && (
          <div className="flex flex-col">
            {summary.cards.map((c) => (
              <div key={c.id} className="flex flex-col gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{c.label}</span>
                  <span className={cn("font-mono tabular-nums", BAND_TEXT[c.band])}>
                    {pct(c.utilization)} · {BAND_LABEL[c.band]}
                  </span>
                </div>
                <UtilizationBar utilization={c.utilization} band={c.band} label={c.label} />
                <p className="text-xs text-muted-foreground">
                  <Money amount={c.balance} currency={currency} tone="neutral" /> of{" "}
                  <Money amount={c.limit} currency={currency} tone="neutral" />
                  {c.payDownToGood > 0 && <> · pay {formatCurrency(c.payDownToGood, currency)} to get under 30%</>}
                </p>
              </div>
            ))}
          </div>
        )}

        {summary.unrated.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No credit limit reported for {summary.unrated.map((c) => cardLabel(c)).join(", ")}, so{" "}
            {summary.unrated.length === 1 ? "it isn't" : "they aren't"} counted.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Based on the balance your bank last reported. Credit bureaus generally see your statement balance, so treat
          this as a guide, not your score.
        </p>
      </CardContent>
    </Card>
  );
}
