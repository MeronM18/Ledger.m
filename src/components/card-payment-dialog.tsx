"use client";

import { useMemo, useState } from "react";
import { Check, ReceiptText } from "lucide-react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  breakdownForPayment,
  cardForBankPayment,
  isCardPaymentCredit,
  isCardPaymentFromBank,
  type Card,
  type CardTx,
  type CloseDaySource,
} from "@/lib/card-statements";
import { formatCurrency } from "@/lib/format";
import { postedDate } from "@/lib/transaction-dates";
import { humanizeCategory } from "@/lib/plaid-categories";
import { effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

const SOURCE: Record<CloseDaySource, (day: number) => string> = {
  set: (d) => `This card's statement closes on the ${ordinal(d)}.`,
  "month-end": () => "Apple Card statements run from the 1st to the end of the month.",
  payments: (d) => `The statement closes on about the ${ordinal(d)}, worked out from your past payments. Set the exact day on the Accounts page.`,
  "due-date": (d) =>
    `The statement closes on about the ${ordinal(d)}, estimated from the due date. Set the exact day (on your statement as the closing date) on the Accounts page.`,
};

/** True for a row that's a credit card payment, from either side. */
export function isCardPaymentRow(t: CardTx, cards: Card[]): boolean {
  const onCard = t.account ? cards.some((c) => c.id === t.account!.id) : false;
  return onCard ? isCardPaymentCredit(t) : isCardPaymentFromBank(t);
}

/**
 * Opens what a credit card payment paid for: the statement it went toward
 * and every charge on it. For a payment seen from checking, the card is the
 * one the same amount landed on within a few days; if none did (or it's
 * ambiguous), you pick the card.
 */
export function CardPaymentButton({ payment, transactions, cards }: { payment: CardTx; transactions: CardTx[]; cards: Card[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Card | null>(null);

  const resolved = useMemo(() => {
    if (!open) return null;
    const own = payment.account ? cards.find((c) => c.id === payment.account!.id) : undefined;
    // Statements go by the day a payment posted.
    if (own) return { card: own, date: postedDate(payment) };
    if (picked) return { card: picked, date: postedDate(payment) };
    const match = cardForBankPayment(payment, cards, transactions);
    return match ? { card: match.card, date: postedDate(match.credit) } : null;
  }, [open, payment, cards, transactions, picked]);

  const breakdown = useMemo(
    () => (resolved ? breakdownForPayment(resolved.card, resolved.date, transactions, payment) : null),
    [resolved, transactions, payment]
  );
  const amount = Math.abs(payment.amount);
  const difference = breakdown ? Math.round((breakdown.paid - breakdown.total) * 100) / 100 : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPicked(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="See what this payment paid for" title="See what this paid for">
          <ReceiptText className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {formatCurrency(amount, "USD")} payment{resolved ? ` to ${resolved.card.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            Paid {longDate(payment.date)}
            {breakdown ? `, toward the statement from ${longDate(breakdown.start)} to ${longDate(breakdown.end)}.` : "."}
          </DialogDescription>
        </DialogHeader>

        {!resolved && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">
              No payment for this amount landed on one of your cards within a few days, so which card it paid isn&apos;t
              clear. Pick it:
            </p>
            <div className="flex flex-wrap gap-2">
              {cards.map((c) => (
                <Button key={c.id} size="sm" variant="outline" onClick={() => setPicked(c)}>
                  {c.name}
                </Button>
              ))}
            </div>
            {cards.length === 0 && <p className="text-muted-foreground">None of your cards are in Ledger.m.</p>}
          </div>
        )}

        {resolved && !breakdown && (
          <p className="text-sm text-muted-foreground">
            Set when {resolved.card.name}&apos;s statement closes (or when payment is due) on the Accounts page, and this
            shows the purchases it paid for.
          </p>
        )}

        {breakdown && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 rounded-md border border-border p-3 text-sm">
              <dt className="text-muted-foreground">Statement total</dt>
              <dd className="text-right">
                <Money amount={breakdown.total} currency="USD" tone="neutral" />
              </dd>
              <dt className="text-muted-foreground">
                Paid toward it
                {breakdown.payments.length > 1 && ` (${breakdown.payments.length} payments)`}
              </dt>
              <dd className="text-right">
                <Money amount={breakdown.paid} currency="USD" tone="neutral" />
              </dd>
              <dt className="font-medium">
                {Math.abs(difference) < 0.01 ? "Paid in full" : difference < 0 ? "Left to pay" : "Paid beyond it"}
              </dt>
              <dd className={cn("text-right font-mono font-medium tabular-nums", difference < -0.005 ? "text-oxblood-text" : "text-moss")}>
                {Math.abs(difference) < 0.01 ? <Check className="ml-auto size-4" aria-label="Yes" /> : formatCurrency(Math.abs(difference), "USD")}
              </dd>
            </dl>
            {breakdown.payments.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Payments toward this statement:{" "}
                {breakdown.payments.map((p) => `${formatCurrency(-p.amount, "USD")} on ${shortDate(p.date)}`).join(", ")}.
              </p>
            )}
            {difference > 0.005 && (
              <p className="text-xs text-muted-foreground">
                The extra went toward charges on the next statement.
              </p>
            )}

            <div className="flex flex-col">
              <p className="pb-2 text-sm font-medium">
                {breakdown.charges.length} {breakdown.charges.length === 1 ? "charge" : "charges"} on this statement
              </p>
              {breakdown.charges.length === 0 && <p className="text-sm text-muted-foreground">Nothing was charged in this period.</p>}
              {breakdown.byCategory.length > 1 && (
                <p className="pb-2 text-xs text-muted-foreground">
                  {breakdown.byCategory.map((c) => `${humanizeCategory(c.category)} ${formatCurrency(c.amount, "USD")}`).join(" · ")}
                </p>
              )}
              {breakdown.charges.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{humanizeTransactionName(t)}</p>
                    <p className="text-xs text-muted-foreground">
                      {shortDate(t.date)} · {humanizeCategory(effectiveCategory(t))}
                      {t.paid_back ? ` · ${formatCurrency(t.paid_back, "USD")} paid back in cash` : ""}
                    </p>
                  </div>
                  <Money amount={t.amount} currency="USD" tone={t.amount >= 0 ? "negative" : "positive"} showSign className="shrink-0" />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">{SOURCE[breakdown.closeDaySource](breakdown.closeDay)}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
