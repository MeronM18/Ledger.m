import { TransactionsExplorer, type TransactionRow } from "@/components/transactions-explorer";
import type { ManualTransaction } from "@/components/manual-transaction-form";
import { QueryErrorState } from "@/components/query-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { MerchantRulesManager } from "@/components/merchant-rules-manager";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { applyEditsToAll } from "@/lib/transaction-edits";
import { loadTransactionEdits } from "@/lib/transaction-edits-server";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const admin = createAdminClient();

  const [
    { data: transactions, error: txError },
    { data: manualTransactions, error: manualTxError },
    { data: accounts, error: acctError },
    edits,
  ] = await Promise.all([
    fetchAllRows((from, to) =>
      admin
        .from("transactions")
        .select(
          "id, date, name, merchant_name, logo_url, pfc_primary, amount, iso_currency_code, pending, account:accounts(id, name, mask)"
        )
        .order("date", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    admin
      .from("manual_transactions")
      .select("id, date, name, amount, pfc_primary, payment_method, notes")
      .order("date", { ascending: false }),
    admin.from("accounts").select("id, name, mask").order("name"),
    loadTransactionEdits(admin),
  ]);

  if (txError) console.error("Failed to load transactions", txError);
  if (manualTxError) console.error("Failed to load manual transactions", manualTxError);
  if (acctError) console.error("Failed to load accounts", acctError);

  const plaidRows = applyEditsToAll(
    (transactions ?? []) as unknown as (TransactionRow & { id: string })[],
    edits.overrides,
    edits.rules
  );
  const manualRows: TransactionRow[] = ((manualTransactions ?? []) as ManualTransaction[]).map((m) => ({
    id: m.id,
    date: m.date,
    name: null,
    merchant_name: m.name,
    logo_url: null,
    pfc_primary: m.pfc_primary,
    amount: m.amount,
    iso_currency_code: null,
    pending: false,
    account: null,
    isManual: true,
    manualSource: m,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Transactions</h1>
      {txError || manualTxError || acctError || edits.error ? (
        <QueryErrorState message="Couldn't load your transactions. Try refreshing the page." />
      ) : (
        <>
          <TransactionsExplorer transactions={[...plaidRows, ...manualRows]} accounts={accounts ?? []} />
          <MerchantRulesManager rules={edits.rules} />
        </>
      )}
    </div>
  );
}
