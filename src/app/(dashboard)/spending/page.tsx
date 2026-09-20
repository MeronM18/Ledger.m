import { SpendingExplorer, type SpendingRow } from "@/components/spending-explorer";
import { QueryErrorState } from "@/components/query-error";
import { filterSpendingTransactions, manualTransactionToSpendingTransaction } from "@/lib/spending-aggregation";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SpendingPage() {
  const admin = createAdminClient();

  const [{ data, error }, { data: manualData, error: manualError }, { data: accounts, error: acctError }] =
    await Promise.all([
      admin
        .from("transactions")
        .select(
          "date, amount, pfc_primary, merchant_name, name, pending, iso_currency_code, account:accounts(id, name, mask)"
        ),
      admin.from("manual_transactions").select("date, name, amount, pfc_primary"),
      admin.from("accounts").select("id, name, mask").order("name"),
    ]);

  if (error) console.error("Failed to load transactions for spending page", error);
  if (manualError) console.error("Failed to load manual transactions for spending page", manualError);
  if (acctError) console.error("Failed to load accounts for spending page", acctError);

  const transactions = (data ?? []) as unknown as SpendingRow[];
  const manualTransactions: SpendingRow[] = (manualData ?? []).map((m) => ({
    ...manualTransactionToSpendingTransaction(m),
    account: null,
    iso_currency_code: null,
  }));
  const allTransactions = [...transactions, ...manualTransactions];
  const currency = transactions[0]?.iso_currency_code ?? "USD";

  const spending = filterSpendingTransactions(allTransactions) as SpendingRow[];

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Spending</h1>

      {error || manualError || acctError ? (
        <QueryErrorState message="Couldn't load your spending data. Try refreshing the page." />
      ) : (
        <SpendingExplorer
          transactions={spending}
          accounts={accounts ?? []}
          currency={currency}
          monthLabel={monthLabel}
        />
      )}
    </div>
  );
}
