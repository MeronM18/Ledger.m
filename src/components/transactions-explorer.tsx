"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, StickyNote } from "lucide-react";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { TransactionFiltersMenu } from "@/components/transaction-filters-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { formatCurrency } from "@/lib/format";
import { CardPaymentButton, isCardPaymentRow } from "@/components/card-payment-dialog";
import type { Card } from "@/lib/card-statements";
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
import { applyListOptions, DEFAULT_LIST_OPTIONS, listTotals, type ListOptions } from "@/lib/transaction-list";

export type TransactionRow = {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  logo_url: string | null;
  pfc_primary: string | null;
  pfc_detailed?: string | null;
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
  // Paid back in cash by someone else: only the rest counts as spending.
  paid_back?: number | null;
  // Only present when isManual is true — carries payment_method/notes for
  // the edit dialog, which TransactionRow's own shape doesn't have room for.
  manualSource?: ManualTransaction;
};

export function TransactionsExplorer({
  transactions,
  accounts,
  cards = [],
}: {
  transactions: TransactionRow[];
  accounts: AccountOption[];
  // Credit cards, so a card payment can show what it paid for.
  cards?: Card[];
}) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [listOptions, setListOptions] = useState<ListOptions>(DEFAULT_LIST_OPTIONS);

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

  // The Filters menu (sort, money in/out, amount range, status, transfers,
  // notes) applies on top of the bar's filters. Sorting always happens
  // here rather than trusting the caller's order: `transactions` merges
  // Plaid and manual rows, which aren't interleaved by date.
  const sorted = useMemo(() => applyListOptions(filtered, listOptions), [filtered, listOptions]);
  const totals = useMemo(() => listTotals(sorted), [sorted]);

  // The column headers set the same sort as the menu.
  function toggleAmountSort() {
    setListOptions((o) => ({ ...o, sort: o.sort === "amount-desc" ? "amount-asc" : "amount-desc" }));
  }
  function toggleDateSort() {
    setListOptions((o) => ({ ...o, sort: o.sort === "newest" ? "oldest" : "newest" }));
  }

  const accountOptions = useMemo(() => [...accounts, MANUAL_ACCOUNT_OPTION], [accounts]);

  // Exports exactly what's on screen — `sorted` already reflects every
  // active filter (search/account/category/month) and the current sort, so
  // this never silently exports the full unfiltered history.
  function exportCsv() {
    const headers = ["Date", "Merchant", "Category", "Account", "Amount", "Paid back in cash", "Pending", "Source", "Notes"];
    const rows = sorted.map((t) => {
      const { displayName, displayCategoryLabel } = humanizeTransaction(t);
      return [
        t.date,
        displayName,
        displayCategoryLabel,
        t.account ? accountLabel(t.account) : t.isManual ? "Cash / Manual" : accountLabel(t.account),
        t.amount.toFixed(2),
        t.paid_back ? t.paid_back.toFixed(2) : "",
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
        actions={
          <>
            <TransactionFiltersMenu options={listOptions} onChange={setListOptions} />
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="size-3.5" />
              Export CSV
            </Button>
            <AddManualTransactionButton />
          </>
        }
      />

      <p className="-mt-1 text-xs text-muted-foreground" aria-live="polite">
        {totals.count} {totals.count === 1 ? "transaction" : "transactions"}
        {totals.count > 0 && (
          <>
            {" · "}
            <span className="font-mono tabular-nums">{formatCurrency(totals.out, "USD")}</span> out
            {" · "}
            <span className="font-mono tabular-nums">{formatCurrency(totals.in, "USD")}</span> in
          </>
        )}
      </p>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No transactions match these filters.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  onClick={toggleDateSort}
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  Date
                  {listOptions.sort === "newest" && <ArrowDown className="size-3" />}
                  {listOptions.sort === "oldest" && <ArrowUp className="size-3" />}
                </button>
              </TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead className="hidden md:table-cell">Account</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  onClick={toggleAmountSort}
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  Amount
                  {listOptions.sort === "amount-asc" && <ArrowUp className="size-3" />}
                  {listOptions.sort === "amount-desc" && <ArrowDown className="size-3" />}
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
                      <TransactionAvatar transaction={t} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
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
                        {t.paid_back ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-moss"
                            title={`Only ${formatCurrency(Math.max(0, t.amount - t.paid_back), t.iso_currency_code)} counts as your spending`}
                          >
                            {t.paid_back >= t.amount - 0.005 ? "Paid back in cash" : `Paid back ${formatCurrency(t.paid_back, t.iso_currency_code)} cash`}
                          </Badge>
                        ) : null}
                        {t.notes && (
                          <span title={t.notes} className="text-muted-foreground">
                            <StickyNote className="size-3.5" aria-label={`Note: ${t.notes}`} />
                          </span>
                        )}
                      </span>
                      {/* On a phone the Account and Category columns are hidden;
                          their details sit under the name instead. */}
                      <span className="truncate text-xs text-muted-foreground md:hidden">
                        {displayCategoryLabel} · {t.account ? accountLabel(t.account) : t.isManual ? "Cash / Manual" : accountLabel(t.account)}
                      </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {t.account ? accountLabel(t.account) : t.isManual ? "Cash / Manual" : accountLabel(t.account)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
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
                    <div className="flex items-center justify-end">
                    {isCardPaymentRow(t, cards) && <CardPaymentButton payment={t} transactions={transactions} cards={cards} />}
                    {t.isManual && t.manualSource && (
                      <ManualTransactionRowActions transaction={t.manualSource} paidBack={t.paid_back ?? null} />
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
                          amount: t.amount,
                          paidBack: t.paid_back ?? null,
                        }}
                      />
                    )}
                    </div>
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
