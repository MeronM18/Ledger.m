import { SpendingReport } from "@/components/spending-report";
import { QueryErrorState } from "@/components/query-error";
import { loadInstitutions } from "@/lib/institutions";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Spending" };

export default async function SpendingPage() {
  const admin = createAdminClient();
  const ledger = await loadLedger(admin);
  if (ledger.error) return <QueryErrorState message="Couldn't load your spending data. Try refreshing the page." />;
  const institutions = await loadInstitutions(admin, ledger);

  return (
    <SpendingReport
      transactions={ledger.transactions}
      connectedCardIssuers={ledger.connectedCardIssuers}
      accounts={ledger.accounts}
      cards={ledger.cards}
      institutions={institutions}
    />
  );
}
