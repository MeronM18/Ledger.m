"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, StickyNote, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  accountLabel,
  FilterBar,
  MANUAL_ACCOUNT_ID,
  MANUAL_ACCOUNT_OPTION,
  type AccountOption,
} from "@/components/filter-bar";
import {
  AddManualTransactionButton,
  ManualTransactionRowActions,
  type ManualTransaction,
} from "@/components/manual-transaction-form";
import { EditTransactionButton } from "@/components/edit-transaction-dialog";
import { downloadCsv, toCsv } from "@/lib/csv";
import { humanizeCategory } from "@/lib/plaid-categories";
import { effectiveCategory, humanizeTransaction, humanizeTransactionName } from "@/lib/transaction-display";

type SortDirection = "asc" | "desc" | null;

export type TransactionRow = {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  logo_url: string | null;
  pfc_primary: string | null;
  // Set by applyEditsToAll (src/lib/transaction-edits.ts) for Plaid rows.
  category_override?: string | null;
  notes?: string | null;
  edited?: boolean;
  original_merchant_name?: string | null;
  amount: number;
  iso_currency_code: string | null;
  pending: boolean;
  account: { id: string; name: string; mask: string | null } | null;
  isManual?: boolean;
  // Only present when isManual is true — carries payment_method/notes for
  // the edit dialog, which TransactionRow's own shape doesn't have room for.
  manualSource?: ManualTransaction;
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
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const categories = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(effectiveCategory(t) ?? "(uncategorized)");
    return Array.from(present)
      .sort()
      .map((c) => ({ value: c, label: c === "(uncategorized)" ? "Uncategorized" : humanizeCategory(c) }));
  }, [transactions]);

  // Distinct statement months actually present in the data — "September
  // 2026", not a generic date-range input, so this feels like flipping
  // through statement periods rather than typing dates.
  const months = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(t.date.slice(0, 7));
    return Array.from(present)
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({
        value: m,
        label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
      }));
  }, [transactions]);

  // NOTE: filtering/searching happens entirely client-side, which is fine at
  // this volume (~100 rows). At meaningfully higher transaction counts this
  // should move to server-side search + pagination (a Supabase query with
  // ilike/range instead of filtering an already-fetched array).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return transactions.filter((t) => {
      if (accountFilter === MANUAL_ACCOUNT_ID) {
        if (t.account !== null) return false;
      } else if (accountFilter !== "all" && t.account?.id !== accountFilter) {
        return false;
      }
      if (categoryFilter !== "all" && (effectiveCategory(t) ?? "(uncategorized)") !== categoryFilter) {
        return false;
      }
      if (monthFilter !== "all" && t.date.slice(0, 7) !== monthFilter) return false;
      if (q) {
        const haystack = `${humanizeTransaction(t).displayName} ${t.merchant_name ?? ""} ${t.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, accountFilter, categoryFilter, monthFilter, search]);

  // Sort works together with the filters above, applied on top of the
  // already-filtered set rather than replacing it. Toggles between
  // desc/asc on repeated header clicks; no "unsorted" state to cycle back
  // to — falls back to date-descending, which must be enforced here rather
  // than trusted from the caller, since `transactions` merges two
  // independently-sorted sources (Plaid + manual) that are concatenated,
  // not interleaved by date, so the merged array is not actually in date
  // order even though each source query is.
  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortDirection) {
      copy.sort((a, b) => (sortDirection === "asc" ? a.amount - b.amount : b.amount - a.amount));
    } else {
      copy.sort((a, b) => b.date.localeCompare(a.date));
    }
    return copy;
  }, [filtered, sortDirection]);

  function toggleSort() {
    setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
  }

  const accountOptions = useMemo(() => [...accounts, MANUAL_ACCOUNT_OPTION], [accounts]);

  // Exports exactly what's on screen — `sorted` already reflects every
  // active filter (search/account/category/month) and the current sort, so
  // this never silently exports the full unfiltered history.
  function exportCsv() {
    const headers = ["Date", "Merchant", "Category", "Account", "Amount", "Pending", "Source", "Notes"];
    const rows = sorted.map((t) => {
      const { displayName, displayCategoryLabel } = humanizeTransaction(t);
      return [
        t.date,
        displayName,
        displayCategoryLabel,
        t.isManual ? "Cash / Manual" : accountLabel(t.account),
        t.amount.toFixed(2),
        t.pending ? "Yes" : "No",
        t.isManual ? "Manual" : "Plaid",
        t.notes ?? t.manualSource?.notes ?? "",
      ];
    });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    downloadCsv(`ledger-transactions-${today}.csv`, toCsv(headers, rows));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          accounts={accountOptions}
          accountValue={accountFilter}
          onAccountChange={setAccountFilter}
          categories={categories}
          categoryValue={categoryFilter}
          onCategoryChange={setCategoryFilter}
          months={months}
          monthValue={monthFilter}
          onMonthChange={setMonthFilter}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <AddManualTransactionButton />
        </div>
      </div>

      {sorted.length === 0 ? (
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
              <TableHead className="text-right">
                <button
                  type="button"
                  onClick={toggleSort}
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  Amount
                  {sortDirection === "asc" && <ArrowUp className="size-3" />}
                  {sortDirection === "desc" && <ArrowDown className="size-3" />}
                </button>
              </TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t) => {
              const isDebit = t.amount >= 0; // Plaid: positive = money out
              const { displayName, displayCategoryLabel } = humanizeTransaction(t);

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
                        {displayName}
                        {t.isManual && (
                          <Badge variant="secondary" className="text-[10px]">
                            Manual
                          </Badge>
                        )}
                        {t.pending && (
                          <Badge variant="secondary" className="text-[10px]">
                            Pending
                          </Badge>
                        )}
                        {t.edited && (
                          <Badge variant="secondary" className="text-[10px]">
                            Edited
                          </Badge>
                        )}
                        {t.notes && (
                          <span title={t.notes} className="text-muted-foreground">
                            <StickyNote className="size-3.5" aria-label={`Note: ${t.notes}`} />
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.isManual ? "Cash / Manual" : accountLabel(t.account)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {displayCategoryLabel}
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
                  <TableCell>
                    {t.isManual && t.manualSource && (
                      <ManualTransactionRowActions transaction={t.manualSource} />
                    )}
                    {!t.isManual && (
                      <EditTransactionButton
                        transaction={{
                          id: t.id,
                          displayName,
                          originalDisplayName: humanizeTransactionName({
                            ...t,
                            merchant_name: t.original_merchant_name ?? t.merchant_name,
                          }),
                          ruleSeed:
                            t.original_merchant_name ||
                            humanizeTransactionName({ ...t, merchant_name: t.original_merchant_name ?? null }),
                          categoryOverride: t.category_override ?? null,
                          notes: t.notes ?? null,
                          edited: Boolean(t.edited),
                        }}
                      />
                    )}
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
