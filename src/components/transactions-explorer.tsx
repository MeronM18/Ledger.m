"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { humanizeCategory } from "@/lib/plaid-categories";
import {
  accountLabel,
  FilterBar,
  type AccountOption,
  type DateRangeKey,
} from "@/components/filter-bar";

export type TransactionRow = {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  logo_url: string | null;
  pfc_primary: string | null;
  amount: number;
  iso_currency_code: string | null;
  pending: boolean;
  account: { id: string; name: string; mask: string | null } | null;
};

export function TransactionsExplorer({
  transactions,
  accounts,
}: {
  transactions: TransactionRow[];
  accounts: AccountOption[];
}) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");

  const categories = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(t.pfc_primary ?? "(uncategorized)");
    return Array.from(present)
      .sort()
      .map((c) => ({ value: c, label: c === "(uncategorized)" ? "Uncategorized" : humanizeCategory(c) }));
  }, [transactions]);

  // NOTE: filtering/searching happens entirely client-side, which is fine at
  // this volume (~100 rows). At meaningfully higher transaction counts this
  // should move to server-side search + pagination (a Supabase query with
  // ilike/range instead of filtering an already-fetched array).
  const filtered = useMemo(() => {
    const now = new Date();
    const cutoff =
      dateRange === "all"
        ? null
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(dateRange));

    const q = search.trim().toLowerCase();

    return transactions.filter((t) => {
      if (accountFilter !== "all" && t.account?.id !== accountFilter) return false;
      if (categoryFilter !== "all" && (t.pfc_primary ?? "(uncategorized)") !== categoryFilter) {
        return false;
      }
      if (cutoff && new Date(t.date) < cutoff) return false;
      if (q) {
        const haystack = `${t.merchant_name ?? ""} ${t.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, accountFilter, categoryFilter, dateRange, search]);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        accounts={accounts}
        accountValue={accountFilter}
        onAccountChange={setAccountFilter}
        categories={categories}
        categoryValue={categoryFilter}
        onCategoryChange={setCategoryFilter}
        dateRangeValue={dateRange}
        onDateRangeChange={setDateRange}
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No transactions match these filters.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => {
              const isDebit = t.amount >= 0; // Plaid: positive = money out
              const merchant = t.merchant_name ?? t.name ?? "Unknown";

              return (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(`${t.date}T00:00:00`).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {t.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external Plaid-hosted logo, small avatar, not worth next/image config for a single-user app
                        <img
                          src={t.logo_url}
                          alt=""
                          className="size-6 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Store className="size-3.5" />
                        </span>
                      )}
                      <span className="flex items-center gap-2">
                        {merchant}
                        {t.pending && (
                          <Badge variant="secondary" className="text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {accountLabel(t.account)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {humanizeCategory(t.pfc_primary)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money
                      amount={t.amount}
                      currency={t.iso_currency_code}
                      tone={isDebit ? "negative" : "positive"}
                      showSign
                      className="font-medium"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
