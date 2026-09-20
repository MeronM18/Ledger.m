"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { SpendingCharts } from "@/components/spending-charts";
import { FilterBar, MANUAL_ACCOUNT_ID, MANUAL_ACCOUNT_OPTION, type AccountOption } from "@/components/filter-bar";
import { humanizeCategory } from "@/lib/plaid-categories";
import {
  categoryTotalsForMonth,
  monthlyTotals,
  refundTransactions,
  topMerchants,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";
import { effectiveCategory } from "@/lib/transaction-display";

export type SpendingRow = SpendingTransaction & {
  account: { id: string; name: string; mask: string | null } | null;
  iso_currency_code: string | null;
};

export function SpendingExplorer({
  transactions,
  accounts,
  currency,
  monthLabel,
}: {
  transactions: SpendingRow[];
  accounts: AccountOption[];
  currency: string | null;
  monthLabel: string;
}) {
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categories = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(effectiveCategory(t) ?? "OTHER");
    return Array.from(present)
      .sort()
      .map((c) => ({ value: c, label: humanizeCategory(c === "OTHER" ? null : c) }));
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (accountFilter === MANUAL_ACCOUNT_ID) {
        if (t.account !== null) return false;
      } else if (accountFilter !== "all" && t.account?.id !== accountFilter) {
        return false;
      }
      if (categoryFilter !== "all" && (effectiveCategory(t) ?? "OTHER") !== categoryFilter) return false;
      return true;
    });
  }, [transactions, accountFilter, categoryFilter]);

  const accountOptions = useMemo(() => [...accounts, MANUAL_ACCOUNT_OPTION], [accounts]);

  const now = new Date();
  const categoryTotals = categoryTotalsForMonth(filtered, now.getFullYear(), now.getMonth());
  const months = monthlyTotals(filtered);
  const merchants = topMerchants(filtered, 10);
  const refunds = refundTransactions(filtered);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        accounts={accountOptions}
        accountValue={accountFilter}
        onAccountChange={setAccountFilter}
        categories={categories}
        categoryValue={categoryFilter}
        onCategoryChange={setCategoryFilter}
      />

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
