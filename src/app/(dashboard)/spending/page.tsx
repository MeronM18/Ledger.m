import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingCharts } from "@/components/spending-charts";
import { formatCurrency } from "@/lib/format";
import {
  categoryTotalsForMonth,
  filterSpendingTransactions,
  monthlyTotals,
  topMerchants,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SpendingPage() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("transactions")
    .select("date, amount, pfc_primary, merchant_name, name, pending, iso_currency_code");

  if (error) console.error("Failed to load transactions for spending page", error);

  const transactions = (data ?? []) as unknown as (SpendingTransaction & {
    iso_currency_code: string | null;
  })[];
  const currency = transactions[0]?.iso_currency_code ?? "USD";

  const spending = filterSpendingTransactions(transactions);

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const categoryTotals = categoryTotalsForMonth(spending, now.getFullYear(), now.getMonth());
  const months = monthlyTotals(spending);
  const merchants = topMerchants(spending, 10);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Spending</h1>

      <SpendingCharts
        categoryTotals={categoryTotals}
        monthlyTotals={months}
        currency={currency}
        monthLabel={monthLabel}
      />

      <Card>
        <CardHeader>
          <CardTitle>Top merchants</CardTitle>
        </CardHeader>
        <CardContent>
          {merchants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spending recorded yet.</p>
          ) : (
            <div className="flex flex-col">
              {merchants.map((m, i) => (
                <div
                  key={m.merchant}
                  className="flex items-center justify-between border-t py-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-sm text-muted-foreground">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{m.merchant}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.count} transaction{m.count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{formatCurrency(m.amount, currency)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
