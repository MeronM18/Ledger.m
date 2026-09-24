import { TransactionsExplorer } from "@/components/transactions-explorer";
import { QueryErrorState } from "@/components/query-error";
import { loadInstitutions } from "@/lib/institutions";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const admin = createAdminClient();
  const [ledger, params] = await Promise.all([loadLedger(admin), searchParams]);

  if (ledger.error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl font-semibold text-bone">Transactions</h1>
        <QueryErrorState message="Couldn't load your transactions. Try refreshing the page." />
      </div>
    );
  }

  const institutions = await loadInstitutions(admin, ledger);
  // Opened from an account on the Accounts page: start filtered to it.
  const requested = typeof params.account === "string" ? params.account : undefined;
  const initialAccount = requested && ledger.accounts.some((a) => a.id === requested) ? requested : "all";

  return (
    <TransactionsExplorer
      transactions={ledger.transactions}
      accounts={ledger.accounts}
      cards={ledger.cards}
      rules={ledger.rules}
      institutions={institutions}
      initialAccount={initialAccount}
    />
  );
}
