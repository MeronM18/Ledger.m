"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { SpendingCharts } from "@/components/spending-charts";
import { SpendingTrends } from "@/components/spending-trends";
import { Button } from "@/components/ui/button";
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
import { categoryChanges, paceComparison, previousMonth, typicalMonth, type MonthRef } from "@/lib/trends";
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
  const searchQuery = search.trim().toLowerCase();
  function matchesSearch(t: SpendingRow): boolean {
    if (!searchQuery) return true;
    const haystack = `${humanizeTransactionName(t)} ${t.merchant_name ?? ""} ${t.name ?? ""} ${humanizeCategory(effectiveCategory(t))}`.toLowerCase();
    return haystack.includes(searchQuery);
  }

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

  // Trends compare the selected month with the one before it (the current
  // month when "All time" is chosen, since a single-month comparison needs
  // a month). Pace follows every filter, including category; the
  // biggest-changes list ignores the category filter so picking a category
  // in it doesn't collapse the list you just picked from.
  const now = new Date();
  const trendRef: MonthRef =
    monthFilter === "all"
      ? { year: now.getFullYear(), month: now.getMonth() }
      : { year: Number(monthFilter.slice(0, 4)), month: Number(monthFilter.slice(5, 7)) - 1 };
  // "September" for the month being viewed, and the year only where it
  // differs, so "August 2026 ended at..." doesn't repeat a year every line.
  const monthName = (m: MonthRef) =>
    new Date(m.year, m.month, 1).toLocaleDateString("en-US", {
      month: "long",
      ...(m.year === trendRef.year ? {} : { year: "numeric" as const }),
    });
  const filteredAnyCategory = transactions.filter((t) => {
    if (accountFilter === MANUAL_ACCOUNT_ID) return t.account === null && matchesSearch(t);
    return (accountFilter === "all" || t.account?.id === accountFilter) && matchesSearch(t);
  });
  const pace = paceComparison(filteredAnyMonth, trendRef, {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
  });
  const changes = categoryChanges(filteredAnyCategory, trendRef);
  const typical = typicalMonth(filteredAnyMonth, trendRef);

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

      <SpendingTrends
        pace={pace}
        changes={changes}
        typical={typical}
        monthLabel={monthName(trendRef)}
        previousMonthLabel={monthName(previousMonth(trendRef))}
        currency={currency}
        activeCategory={categoryFilter}
        onSelectCategory={setCategoryFilter}
      />

      {categoryFilter !== "all" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {categories.find((c) => c.value === categoryFilter)?.label ?? "Category"} · {selectedMonthLabel}
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setCategoryFilter("all")}>
              Clear category
            </Button>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions in this category for this month.</p>
            ) : (
              <div className="flex flex-col">
                {[...filtered]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 50)
                  .map((t, i) => (
                    <div
                      key={`${t.date}-${i}`}
                      className="flex items-center justify-between border-t border-border py-2 first:border-t-0 first:pt-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{humanizeTransactionName(t)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(`${t.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <Money
                        amount={t.amount}
                        currency={currency}
                        tone={t.amount >= 0 ? "negative" : "positive"}
                        showSign
                        className="text-sm font-medium"
                      />
                    </div>
                  ))}
                {filtered.length > 50 && (
                  <p className="pt-3 text-xs text-muted-foreground">Showing the 50 most recent of {filtered.length}.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center justify-between gap-4">
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
                  <div className="ml-8 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-oxblood/70"
                      style={{ width: `${(m.amount / merchants[0].amount) * 100}%` }}
                    />
                  </div>
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
