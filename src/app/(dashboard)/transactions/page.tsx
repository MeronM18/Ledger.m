import { TransactionsExplorer, type TransactionRow } from "@/components/transactions-explorer";
import { QueryErrorState } from "@/components/query-error";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function TransactionsPage() {
  const admin = createAdminClient();

  const [{ data: transactions, error: txError }, { data: accounts, error: acctError }] =
    await Promise.all([
      admin
        .from("transactions")
        .select(
          "id, date, name, merchant_name, logo_url, pfc_primary, amount, iso_currency_code, pending, account:accounts(id, name, mask)"
        )
        .order("date", { ascending: false }),
      admin.from("accounts").select("id, name, mask").order("name"),
    ]);

  if (txError) console.error("Failed to load transactions", txError);
  if (acctError) console.error("Failed to load accounts", acctError);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Transactions</h1>
      {txError || acctError ? (
        <QueryErrorState message="Couldn't load your transactions. Try refreshing the page." />
      ) : (
        <TransactionsExplorer
          transactions={(transactions ?? []) as unknown as TransactionRow[]}
          accounts={accounts ?? []}
        />
      )}
    </div>
  );
}
