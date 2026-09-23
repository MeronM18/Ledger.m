import { SpendingExplorer, type SpendingRow } from "@/components/spending-explorer";
import { QueryErrorState } from "@/components/query-error";
import { filterSpendingTransactions, manualTransactionToSpendingTransaction } from "@/lib/spending-aggregation";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { applyEditsToAll } from "@/lib/transaction-edits";
import { loadTransactionEdits } from "@/lib/transaction-edits-server";

export const metadata = { title: "Spending" };

export default async function SpendingPage() {
  const admin = createAdminClient();

  const [
    { data, error },
    { data: manualData, error: manualError },
    { data: accounts, error: acctError },
    { data: creditAccounts, error: creditAcctError },
    edits,
  ] = await Promise.all([
    fetchAllRows((from, to) =>
      admin
        .from("transactions")
        .select(
          "id, date, amount, pfc_primary, pfc_detailed, merchant_name, name, pending, iso_currency_code, account:accounts(id, name, mask)"
        )
        .order("date", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    admin.from("manual_transactions").select("date, name, amount, pfc_primary"),
    admin.from("accounts").select("id, name, mask").order("name"),
    admin.from("accounts").select("item:items(institution_name)").eq("type", "credit"),
    loadTransactionEdits(admin),
  ]);

  if (error) console.error("Failed to load transactions for spending page", error);
  if (manualError) console.error("Failed to load manual transactions for spending page", manualError);
  if (acctError) console.error("Failed to load accounts for spending page", acctError);
  if (creditAcctError) console.error("Failed to load connected credit accounts for spending page", creditAcctError);

  const transactions = applyEditsToAll(
    (data ?? []) as unknown as (SpendingRow & { id: string })[],
    edits.overrides,
    edits.rules
  ) as SpendingRow[];
  const manualTransactions: SpendingRow[] = (manualData ?? []).map((m) => ({
    ...manualTransactionToSpendingTransaction(m),
    account: null,
    iso_currency_code: null,
  }));
  const allTransactions = [...transactions, ...manualTransactions];
  const currency = transactions[0]?.iso_currency_code ?? "USD";

  // Only institutions with a connected *credit*-type account count as a
  // "connected card" for the payment-exclusion rule below — a connected
  // savings/checking account at the same institution a card payment is
  // processed under (e.g. Amex here is a savings account, not a card)
  // must never accidentally suppress that payment as if it were the card
  // itself.
  const connectedCardIssuers = Array.from(
    new Set(
      (creditAccounts ?? [])
        .map((a) => (a.item as unknown as { institution_name: string | null } | null)?.institution_name)
        .filter((name): name is string => Boolean(name))
    )
  );

  const spending = filterSpendingTransactions(allTransactions, connectedCardIssuers) as SpendingRow[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Spending</h1>

      {error || manualError || acctError || creditAcctError || edits.error ? (
        <QueryErrorState message="Couldn't load your spending data. Try refreshing the page." />
      ) : (
        <SpendingExplorer transactions={spending} accounts={accounts ?? []} currency={currency} />
      )}
    </div>
  );
}
