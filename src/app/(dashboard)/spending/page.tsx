import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { SpendingCharts } from "@/components/spending-charts";
import {
  categoryTotalsForMonth,
  filterSpendingTransactions,
  monthlyTotals,
  refundTransactions,
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
  const refunds = refundTransactions(spending);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Spending</h1>

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
                  className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 font-mono text-sm text-muted-foreground">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{m.merchant}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.count} transaction{m.count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <Money amount={m.amount} currency={currency} tone="negative" className="text-sm font-medium" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Refunds</CardTitle>
        </CardHeader>
        <CardContent>
          {refunds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No refunds recorded.</p>
          ) : (
            <div className="flex flex-col">
              {refunds.map((r, i) => (
                <div
                  key={`${r.date}-${r.merchant}-${i}`}
                  className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <div>
                    <p className="text-sm font-medium">{r.merchant}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${r.date}T00:00:00`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {r.categoryLabel}
                    </p>
                  </div>
                  <Money
                    amount={r.amount}
                    currency={currency}
                    tone="positive"
                    showSign
                    className="text-sm font-medium"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
