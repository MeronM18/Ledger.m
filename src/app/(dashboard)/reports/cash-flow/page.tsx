import { CashFlowFlows } from "@/components/cash-flow-report";
import { QueryErrorState } from "@/components/query-error";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Cash flow" };

/** Where the money came from and went, over a period you pick. */
export default async function CashFlowPage() {
  const ledger = await loadLedger(createAdminClient());
  if (ledger.error) return <QueryErrorState message="Couldn't load your cash flow. Try refreshing the page." />;
  // Only what the charts read goes to the browser, not each row's logo, account and edit history.
  const transactions = ledger.transactions.map((t) => ({
    date: t.date,
    posted_date: t.posted_date ?? null,
    amount: t.amount,
    pfc_primary: t.pfc_primary,
    pfc_detailed: t.pfc_detailed ?? null,
    category_override: t.category_override ?? null,
    merchant_name: t.merchant_name,
    name: t.name,
    pending: t.pending,
    paid_back: t.paid_back ?? null,
  }));
  return <CashFlowFlows transactions={transactions} connectedCardIssuers={ledger.connectedCardIssuers} />;
}
