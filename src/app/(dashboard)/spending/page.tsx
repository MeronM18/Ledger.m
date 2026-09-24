import { SpendingExplorer } from "@/components/spending-explorer";
import { QueryErrorState } from "@/components/query-error";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Spending" };

export default async function SpendingPage() {
  const ledger = await loadLedger(createAdminClient());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Spending</h1>

      {ledger.error ? (
        <QueryErrorState message="Couldn't load your spending data. Try refreshing the page." />
      ) : (
        <SpendingExplorer transactions={ledger.spending} accounts={ledger.accounts} currency={ledger.currency} />
      )}
    </div>
  );
}
