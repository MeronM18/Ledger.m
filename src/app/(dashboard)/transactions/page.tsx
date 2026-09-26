import { TransactionsExplorer } from "@/components/transactions-explorer";
import { QueryErrorState } from "@/components/query-error";
import { depositsToReview } from "@/lib/deposit-review";
import { loadInstitutions } from "@/lib/institutions";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import type { KindFilter } from "@/lib/transaction-kind";
import { loadDepositReviews } from "@/lib/ui-preferences";

export const metadata = { title: "Transactions" };

const KINDS: KindFilter[] = ["all", "spending", "income", "card-payment", "transfer"];
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[]; month?: string | string[]; category?: string | string[]; kind?: string | string[] }>;
}) {
  const admin = createAdminClient();
  const [ledger, params, { data: goalRows, error: goalError }, depositReviews] = await Promise.all([
    loadLedger(admin),
    searchParams,
    admin.from("savings_goals").select("name, account_refs").order("created_at"),
    loadDepositReviews(admin),
  ]);

  if (ledger.error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Transactions</h1>
        <QueryErrorState message="Couldn't load your transactions. Try refreshing the page." />
      </div>
    );
  }
  // Without goals the list still works; its rows just aren't marked as going toward one.
  if (goalError) console.error("Failed to load goals for transactions", goalError);

  // The goals each account holds, by the ledger's account id ("manual:<id>"
  // for a manual account, the bare id for a connected one).
  const goals: Record<string, string[]> = {};
  for (const g of goalRows ?? []) {
    for (const ref of (g.account_refs as string[] | null) ?? []) {
      const id = ref.startsWith("plaid:") ? ref.slice(6) : ref;
      (goals[id] ??= []).push(g.name as string);
    }
  }

  const institutions = await loadInstitutions(admin, ledger);
  // Opened from an account on the Accounts page, or a category on Budgets: start filtered to it.
  const account = one(params.account);
  const month = one(params.month);
  const kind = one(params.kind) as KindFilter | undefined;
  const waiting = depositReviews.error ? 0 : depositsToReview(ledger.transactions, new Set(ledger.cards.map((c) => c.id)), depositReviews.reviews, calendarNow().isoDate).length;

  return (
    <TransactionsExplorer
      transactions={ledger.transactions}
      accounts={ledger.accounts}
      cards={ledger.cards}
      connectedCardIssuers={ledger.connectedCardIssuers}
      goals={goals}
      rules={ledger.rules}
      institutions={institutions}
      initialAccount={account && ledger.accounts.some((a) => a.id === account) ? account : "all"}
      initialMonth={month && /^\d{4}-\d{2}$/.test(month) ? month : "all"}
      initialCategory={one(params.category) ?? "all"}
      initialKind={kind && KINDS.includes(kind) ? kind : "all"}
      depositsToReview={waiting}
    />
  );
}
