import { CashFlowFlows } from "@/components/cash-flow-report";
import { QueryErrorState } from "@/components/query-error";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Cash flow" };

/** Where the money came from and went, over a period you pick. */
export default async function CashFlowPage() {
  const ledger = await loadLedger(createAdminClient());
  if (ledger.error) return <QueryErrorState message="Couldn't load your cash flow. Try refreshing the page." />;
  return <CashFlowFlows transactions={ledger.transactions} connectedCardIssuers={ledger.connectedCardIssuers} />;
}
