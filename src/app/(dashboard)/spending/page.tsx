import { SpendingExplorer, type SpendingRow } from "@/components/spending-explorer";
import { QueryErrorState } from "@/components/query-error";
import { filterSpendingTransactions, manualTransactionToSpendingTransaction } from "@/lib/spending-aggregation";
import { loadConnectedCardIssuers, loadManualAccounts } from "@/lib/manual-accounts";
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
    { issuers: connectedCardIssuers, error: creditAcctError },
    { accounts: manualCards, error: manualCardsError },
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
    admin.from("manual_transactions").select("date, name, amount, pfc_primary, manual_account_id"),
    admin.from("accounts").select("id, name, mask").order("name"),
    loadConnectedCardIssuers(admin),
    loadManualAccounts(admin),
    loadTransactionEdits(admin),
  ]);

  if (error) console.error("Failed to load transactions for spending page", error);
  if (manualError) console.error("Failed to load manual transactions for spending page", manualError);
  if (acctError) console.error("Failed to load accounts for spending page", acctError);

  const transactions = applyEditsToAll(
    (data ?? []) as unknown as (SpendingRow & { id: string })[],
    edits.overrides,
    edits.rules
  ) as SpendingRow[];
  const manualById = new Map(manualCards.map((c) => [c.id, { id: `manual:${c.id}`, name: c.name, mask: c.mask }]));
  const manualTransactions: SpendingRow[] = (manualData ?? []).map((m) => ({
    ...manualTransactionToSpendingTransaction(m),
    account: (m.manual_account_id && manualById.get(m.manual_account_id)) || null,
    iso_currency_code: null,
  }));
  const allTransactions = [...transactions, ...manualTransactions];
  const currency = transactions[0]?.iso_currency_code ?? "USD";

  const spending = filterSpendingTransactions(allTransactions, connectedCardIssuers) as SpendingRow[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Spending</h1>

      {error || manualError || acctError || creditAcctError || manualCardsError || edits.error ? (
        <QueryErrorState message="Couldn't load your spending data. Try refreshing the page." />
      ) : (
        <SpendingExplorer transactions={spending} accounts={[...(accounts ?? []), ...Array.from(manualById.values())]} currency={currency} />
      )}
    </div>
  );
}
