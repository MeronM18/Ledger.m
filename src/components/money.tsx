import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

export type MoneyTone = "positive" | "negative" | "neutral";

/**
 * Every dollar amount in the app renders through this component: IBM Plex
 * Mono, tabular-nums, and an explicit tone (never plain bone/white for a
 * signed amount). Tone is always passed explicitly rather than inferred
 * from the raw number's sign — "positive"/"negative" means different things
 * in different contexts (Plaid's debit-positive convention on transactions
 * vs. a subscription cost, which is always a "negative" outflow regardless
 * of how it's stored) so the caller decides what the number means here.
 *
 * `showSign`: prefix a manual "+"/"-" and format the absolute value (for
 * transaction rows, where the ledger convention is inverted for display).
 * Leave it off to just format the amount as-is, sign and all, via
 * Intl.NumberFormat (for balances/totals that may be genuinely negative).
 */
export function Money({
  amount,
  currency,
  tone = "neutral",
  showSign = false,
  className,
}: {
  amount: number;
  currency?: string | null;
  tone?: MoneyTone;
  showSign?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === "positive" ? "text-sage" : tone === "negative" ? "text-brick" : "text-bone";

  const prefix = showSign ? (tone === "negative" ? "-" : tone === "positive" ? "+" : "") : "";
  const displayAmount = showSign ? Math.abs(amount) : amount;

  return (
    <span className={cn("font-mono tabular-nums", toneClass, className)}>
      {prefix}
      {formatCurrency(displayAmount, currency ?? "USD")}
    </span>
  );
}
