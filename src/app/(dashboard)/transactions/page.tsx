import { TransactionsExplorer } from "@/components/transactions-explorer";
import { QueryErrorState } from "@/components/query-error";
import { MerchantRulesManager } from "@/components/merchant-rules-manager";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const ledger = await loadLedger(createAdminClient());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Transactions</h1>
      {ledger.error ? (
        <QueryErrorState message="Couldn't load your transactions. Try refreshing the page." />
      ) : (
        <>
          <TransactionsExplorer transactions={ledger.transactions} accounts={ledger.accounts} />
          <MerchantRulesManager rules={ledger.rules} />
        </>
      )}
    </div>
  );
}
