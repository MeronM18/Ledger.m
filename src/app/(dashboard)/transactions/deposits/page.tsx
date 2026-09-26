import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AnswersHelp, DepositReviewCard } from "@/components/deposit-review";
import { QueryErrorState } from "@/components/query-error";
import { chargeOptions, depositsToReview, reviewedDeposits } from "@/lib/deposit-review";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { loadDepositReviews } from "@/lib/ui-preferences";

export const metadata = { title: "Deposits" };

// The newest charges sent along for "paid me back", to pick from or search.
const CHARGES_SENT = 300;
// Reviewed deposits listed, newest first.
const REVIEWED_SHOWN = 200;

/**
 * Money that came in and isn't a paycheck or interest: the deposits still
 * waiting to be told what they were, and every one already answered, to
 * change or undo. The Overview shows only the waiting ones, and only while
 * there are some.
 */
export default async function DepositsPage() {
  const admin = createAdminClient();
  const [ledger, depositReviews] = await Promise.all([loadLedger(admin), loadDepositReviews(admin)]);

  const header = (
    <div className="flex flex-col gap-1 md:pr-12">
      <Link href="/transactions" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne">
        <ChevronLeft className="size-3.5" aria-hidden />
        Transactions
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold text-bone">Deposits</h1>
        {/* At the top, left of the alerts bell (in the layout); on a phone, beside the title. */}
        <AnswersHelp className="md:absolute md:top-0 md:right-10 md:z-10" />
      </div>
      <p className="text-sm text-muted-foreground">Zelle transfers, checks and other money in that isn&apos;t a paycheck or interest, and what you said each one was.</p>
    </div>
  );

  if (ledger.error || depositReviews.error) {
    return (
      <div className="flex max-w-5xl flex-col gap-6">
        {header}
        <QueryErrorState message="Couldn't load your deposits. Try refreshing the page." />
      </div>
    );
  }

  const cardIds = new Set(ledger.cards.map((c) => c.id));
  const toReview = depositsToReview(ledger.transactions, cardIds, depositReviews.reviews, calendarNow().isoDate);
  const reviewed = reviewedDeposits(ledger.transactions, depositReviews.reviews, REVIEWED_SHOWN);
  const earliest = [...toReview, ...reviewed].reduce<string | null>((min, d) => (min === null || d.date < min ? d.date : min), null);
  const charges = earliest ? chargeOptions(ledger.transactions, earliest, ledger.connectedCardIssuers).slice(0, CHARGES_SENT) : [];

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {header}
      <DepositReviewCard variant="page" deposits={toReview} reviewed={reviewed} charges={charges} />
    </div>
  );
}
