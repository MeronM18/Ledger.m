"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { SpendingCharts } from "@/components/spending-charts";
import { FilterBar, MANUAL_ACCOUNT_ID, MANUAL_ACCOUNT_OPTION, type AccountOption } from "@/components/filter-bar";
import { humanizeCategory } from "@/lib/plaid-categories";
import {
  categoryTotalsForMonth,
  displayCategoryKey,
  monthlyTotals,
  refundTransactions,
  topMerchants,
  type SpendingTransaction,
} from "@/lib/spending-aggregation";
import { effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

export type SpendingRow = SpendingTransaction & {
  account: { id: string; name: string; mask: string | null } | null;
  iso_currency_code: string | null;
};

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function SpendingExplorer({
  transactions,
  accounts,
  currency,
}: {
  transactions: SpendingRow[];
  accounts: AccountOption[];
  currency: string | null;
}) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  // Defaults to the real current month, matching this page's behavior
  // before a month selector existed at all (the donut was hardcoded to
  // `now`) — nothing changes visually on first load, but it's now a real,
  // user-changeable selection rather than a fixed "today's month" pie.
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthValue());

  const categories = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(displayCategoryKey(t));
    return Array.from(present)
      .sort()
      .map((c) => ({
        value: c,
        // displayCategoryKey already folds the LOAN_PAYMENTS carve-in
        // bucket (Apple Card, Elan, Cardmember Service, ...) into the same
        // "OTHER" key a genuinely uncategorized transaction uses, so this
        // is one filter option covering both, not two easily-confused
        // ones.
        label: c === "OTHER" ? "Other/Uncategorized" : humanizeCategory(c),
      }));
  }, [transactions]);

  const monthOptions = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(t.date.slice(0, 7));
    return Array.from(present)
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({
        value: m,
        label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      }));
  }, [transactions]);

  // Account/category/search only — this is what the "Spending by month"
  // bar chart uses, deliberately NOT narrowed by monthFilter, since
  // collapsing a multi-month trend chart down to whichever single month is
  // selected would leave it showing one bar. It stays a trend across
  // whatever account/category/search scope is active; only the donut and
  // Top merchants scope down to the selected month.
  const filteredAnyMonth = useMemo(() => {
    const q = search.trim().toLowerCase();

    return transactions.filter((t) => {
      if (accountFilter === MANUAL_ACCOUNT_ID) {
        if (t.account !== null) return false;
      } else if (accountFilter !== "all" && t.account?.id !== accountFilter) {
        return false;
      }
      if (categoryFilter !== "all" && displayCategoryKey(t) !== categoryFilter) return false;
      if (q) {
        const haystack = `${humanizeTransactionName(t)} ${t.merchant_name ?? ""} ${t.name ?? ""} ${humanizeCategory(effectiveCategory(t))}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, accountFilter, categoryFilter, search]);

  // The same set, further narrowed to the selected month — this is what
  // the donut and Top merchants both read from, so they can never drift
  // apart from each other the way Top merchants previously drifted from
  // the donut by skipping month-scoping entirely.
  const filtered = useMemo(() => {
    if (monthFilter === "all") return filteredAnyMonth;
    return filteredAnyMonth.filter((t) => t.date.slice(0, 7) === monthFilter);
  }, [filteredAnyMonth, monthFilter]);

  const accountOptions = useMemo(() => [...accounts, MANUAL_ACCOUNT_OPTION], [accounts]);

  const selectedMonthLabel =
    monthFilter === "all"
      ? "All time"
      : new Date(`${monthFilter}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const categoryTotals =
    monthFilter === "all"
      ? categoryTotalsForMonth(filtered)
      : categoryTotalsForMonth(filtered, Number(monthFilter.slice(0, 4)), Number(monthFilter.slice(5, 7)) - 1);
  const months = monthlyTotals(filteredAnyMonth);
  const merchants = topMerchants(filtered, 10);
  const refunds = refundTransactions(filtered);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        accounts={accountOptions}
        accountValue={accountFilter}
        onAccountChange={setAccountFilter}
        categories={categories}
        categoryValue={categoryFilter}
        onCategoryChange={setCategoryFilter}
        months={monthOptions}
        monthValue={monthFilter}
        onMonthChange={setMonthFilter}
      />

      <SpendingCharts
        categoryTotals={categoryTotals}
        monthlyTotals={months}
        currency={currency}
        monthLabel={selectedMonthLabel}
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
