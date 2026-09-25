"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Download, Search, StickyNote } from "lucide-react";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { TransactionFiltersMenu } from "@/components/transaction-filters-menu";
import { MerchantRulesButton } from "@/components/merchant-rules-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Money } from "@/components/money";
import { formatCurrency } from "@/lib/format";
import { benefitBadge, benefitName, PROGRAMS, rateLabel, type Reward } from "@/lib/card-rewards";
import { CardPaymentButton, isCardPaymentRow } from "@/components/card-payment-dialog";
import type { Card as StatementCard } from "@/lib/card-statements";
import { accountLabel, MANUAL_ACCOUNT_ID, MANUAL_ACCOUNT_OPTION, type AccountOption } from "@/components/filter-bar";
import { AddManualTransactionButton, ManualTransactionForm, type ManualTransaction } from "@/components/manual-transaction-form";
import { EditTransactionForm } from "@/components/edit-transaction-form";
import { downloadCsv, toCsv } from "@/lib/csv";
import { humanizeCategory } from "@/lib/plaid-categories";
import type { MerchantRule } from "@/lib/transaction-edits";
import { effectiveCategory, humanizeTransaction, humanizeTransactionName } from "@/lib/transaction-display";
import { transactionIconColor } from "@/lib/transaction-icons";
import { applyListOptions, DEFAULT_LIST_OPTIONS, groupByDay, listSummary, type ListOptions } from "@/lib/transaction-list";
import { cn } from "@/lib/utils";

export type TransactionRow = {
  id: string;
  date: string;
  // The day it posted, when that's different from the day of the purchase.
  posted_date?: string | null;
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
  // Only present when isManual is true: the stored row, for its edit form.
  manualSource?: ManualTransaction;
  // What it earned on a rewards card, estimated.
  reward?: Reward;
};

const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function accountText(t: TransactionRow): string {
  return t.account ? accountLabel(t.account) : t.isManual ? "Cash / Manual" : accountLabel(t.account);
}

/** Money in in green with a plus; money out plain, as spending is the usual case. */
function Amount({ t, className }: { t: TransactionRow; className?: string }) {
  const incoming = t.amount < 0; // Plaid: positive = money out
  return (
    <Money
      amount={t.amount}
      currency={t.iso_currency_code}
      tone={incoming ? "positive" : "neutral"}
      showSign={incoming}
      className={cn(!incoming && "text-bone", className)}
    />
  );
}

function Badges({ t }: { t: TransactionRow }) {
  return (
    <>
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
      {(t.notes ?? t.manualSource?.notes) && (
        <span title={t.notes ?? t.manualSource?.notes ?? ""} className="text-muted-foreground">
          <StickyNote className="size-3.5" aria-label={`Note: ${t.notes ?? t.manualSource?.notes}`} />
        </span>
      )}
    </>
  );
}

function CategoryLabel({ t, label }: { t: TransactionRow; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: transactionIconColor(t) }} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

function institutionOf(t: TransactionRow, institutions: Record<string, string>): string | null {
  return t.account ? (institutions[t.account.id] ?? null) : null;
}

function AccountLabel({ t, institutions }: { t: TransactionRow; institutions: Record<string, string> }) {
  const institution = institutionOf(t, institutions);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <InstitutionAvatar institution={institution} icon={institution ? undefined : "cash"} size="sm" />
      <span className="truncate">{accountText(t)}</span>
    </span>
  );
}

/** One transaction in the list; opens its panel. */
function Row({
  t,
  showDate,
  institutions,
  onOpen,
}: {
  t: TransactionRow;
  showDate: boolean;
  institutions: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const { displayName, displayCategoryLabel } = humanizeTransaction(t);
  return (
    // Off-screen rows skip layout, so the sidebar sliding (which resizes
    // the list every frame) only lays out what you can see.
    <li className="border-t border-border first:border-t-0 [contain-intrinsic-size:auto_53px] [content-visibility:auto]">
      <button
        type="button"
        onClick={() => onOpen(t.id)}
        data-transaction={t.id}
        className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_7.5rem_1rem]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <TransactionAvatar transaction={t} className="size-7" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <span className="truncate font-medium">{displayName}</span>
              <Badges t={t} />
              {t.reward && <RewardBadge reward={t.reward} />}
            </span>
            {/* The date when the list isn't grouped by day; on a phone, the columns that don't fit. */}
            <span className={cn("truncate text-xs text-muted-foreground", !showDate && "md:hidden")}>
              {showDate && shortDay(t.date)}
              <span className="md:hidden">
                {showDate && " · "}
                {displayCategoryLabel} · {accountText(t)}
              </span>
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 text-sm text-muted-foreground md:block">
          <CategoryLabel t={t} label={displayCategoryLabel} />
        </span>
        <span className="hidden min-w-0 text-sm text-muted-foreground md:block">
          <AccountLabel t={t} institutions={institutions} />
        </span>
        <Amount t={t} className="justify-self-end text-right text-sm font-medium" />
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

export function SummaryLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono tabular-nums">{children}</dd>
    </div>
  );
}

function Summary({ rows, onExport }: { rows: TransactionRow[]; onExport: () => void }) {
  const s = listSummary(rows);
  // What the listed purchases earned on rewards cards.
  const points = rows.reduce((sum, t) => sum + (t.reward?.unit === "points" ? t.reward.earned : 0), 0);
  const cash = Math.round(rows.reduce((sum, t) => sum + (t.reward?.unit === "cash" ? t.reward.earned : 0), 0) * 100) / 100;
  return (
    <Card aria-label="Summary">
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col text-sm">
          <SummaryLine label="Total transactions">
            <span data-testid="summary-count">{s.count}</span>
          </SummaryLine>
          <SummaryLine label="Money in">
            <span className="text-moss">{s.moneyIn > 0 ? `+${formatCurrency(s.moneyIn, "USD")}` : formatCurrency(0, "USD")}</span>
          </SummaryLine>
          <SummaryLine label="Money out">{formatCurrency(s.moneyOut, "USD")}</SummaryLine>
          {s.pending.count > 0 && (
            <SummaryLine label={`Pending (${s.pending.count})`}>
              <span className="text-muted-foreground">{formatCurrency(Math.abs(s.pending.amount), "USD")}</span>
            </SummaryLine>
          )}
          <SummaryLine label="Largest expense">{s.largestExpense ? formatCurrency(s.largestExpense.amount, "USD") : "—"}</SummaryLine>
          <SummaryLine label="Largest deposit">
            {s.largestDeposit ? <span className="text-moss">+{formatCurrency(s.largestDeposit.amount, "USD")}</span> : "—"}
          </SummaryLine>
          <SummaryLine label="Average expense">{s.averageExpense !== null ? formatCurrency(s.averageExpense, "USD") : "—"}</SummaryLine>
          {points !== 0 && (
            <SummaryLine label="Points earned">
              <span className="text-champagne">{points.toLocaleString("en-US")}</span>
            </SummaryLine>
          )}
          {cash !== 0 && (
            <SummaryLine label="Daily Cash earned">
              <span className="text-champagne">{formatCurrency(cash, "USD")}</span>
            </SummaryLine>
          )}
          <SummaryLine label="First transaction">
            <span className="font-sans">{s.first ? shortDay(s.first) : "—"}</span>
          </SummaryLine>
          <SummaryLine label="Last transaction">
            <span className="font-sans">{s.last ? shortDay(s.last) : "—"}</span>
          </SummaryLine>
        </dl>
        {s.pending.count > 0 && (
          <p className="text-xs text-muted-foreground">Pending charges count here, but not in Spending or Budgets until they post.</p>
        )}
        <Button variant="ghost" size="sm" className="text-champagne hover:text-champagne" onClick={onExport} disabled={s.count === 0}>
          <Download className="size-3.5" />
          Download CSV
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The card benefit a purchase used, beside its name: "3x dining" on a
 * Chase card (only above 1x), "$4.23 Daily Cash" on Apple Card.
 */
function RewardBadge({ reward }: { reward: Reward }) {
  const text = benefitBadge(reward);
  if (!text) return null;
  return (
    <Badge
      variant="secondary"
      className="border-champagne/30 bg-champagne/10 text-[11px] tracking-normal text-champagne normal-case"
      title={`${rewardEarned(reward)} · ${rewardWhy(reward)}`}
    >
      {text}
    </Badge>
  );
}

/** "3x on dining", "$4.23 Daily Cash": what the purchase earned, the way the card pays it. */
function rewardHeadline(r: Reward): string {
  if (r.unit === "cash") return `${formatCurrency(Math.abs(r.earned), "USD")} Daily Cash${r.earned < 0 ? " taken back" : ""}`;
  return `${r.rate}x on ${benefitName(r.why)}${r.why.startsWith("Quarterly 5%: ") ? ", this quarter's 5% category" : ""}`;
}

/** "128 points", "$4.23 Daily Cash". */
function rewardEarned(r: Reward): string {
  const n = Math.abs(r.earned);
  const amount = r.unit === "points" ? `${n.toLocaleString("en-US")} point${n === 1 ? "" : "s"}` : `${formatCurrency(n, "USD")} Daily Cash`;
  return r.earned < 0 ? `${amount} taken back` : amount;
}

/** Why it earned that: "3x on dining · Chase Sapphire Preferred". */
function rewardWhy(r: Reward): string {
  const card = PROGRAMS[r.program].name;
  const what = r.why.startsWith("Quarterly 5%: ")
    ? `on this quarter's ${benefitName(r.why)} category`
    : r.program === "apple-card"
      ? r.rate === 2
        ? "with Apple Pay (1% with the physical card)"
        : `at ${r.why}`
      : `on ${benefitName(r.why)}`;
  const cap = r.capped ? "; over the $1,500 quarterly cap, so partly at the usual rate" : "";
  return `${rateLabel(r)} ${what} · ${card}${cap}`;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/** The panel that slides in from the right: everything about a transaction, and changing it. */
function TransactionPanel({
  t,
  transactions,
  cards,
  institutions,
  onClose,
}: {
  t: TransactionRow;
  transactions: TransactionRow[];
  cards: StatementCard[];
  institutions: Record<string, string>;
  onClose: () => void;
}) {
  const { displayName, displayCategoryLabel } = humanizeTransaction(t);
  const posted = t.posted_date && t.posted_date !== t.date ? t.posted_date : null;
  const original = humanizeTransactionName({ ...t, merchant_name: t.original_merchant_name ?? t.merchant_name });

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <TransactionAvatar transaction={t} className="size-10" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="truncate">{displayName}</SheetTitle>
            <SheetDescription>
              {longDay(t.date)} · {accountText(t)}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Amount t={t} className="text-2xl font-semibold" />
          <Badges t={t} />
        </div>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5">
        <dl className="flex flex-col divide-y divide-border rounded-lg border border-border px-3 text-sm">
          <Detail label="Date">{longDay(t.date)}</Detail>
          {posted && <Detail label="Posted">{longDay(posted)}</Detail>}
          <Detail label="Account">
            <span className="inline-flex max-w-full justify-end">
              <AccountLabel t={t} institutions={institutions} />
            </span>
          </Detail>
          <Detail label="Category">
            <span className="inline-flex max-w-full justify-end">
              <CategoryLabel t={t} label={displayCategoryLabel} />
            </span>
          </Detail>
          {t.reward && (
            <Detail label="Rewards">
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-champagne">{rewardHeadline(t.reward)}</span>
                <span className="text-xs text-muted-foreground">
                  {t.reward.unit === "points" ? `${rewardEarned(t.reward)} · ${PROGRAMS[t.reward.program].name}` : rewardWhy(t.reward)}
                  {t.reward.capped ? "; partly past the $1,500 quarterly cap" : ""}
                </span>
              </span>
            </Detail>
          )}
          <Detail label="Status">{t.pending ? "Pending" : "Posted"}</Detail>
          <Detail label="Source">{t.isManual ? (t.account ? "Imported from a statement" : "Added by you") : "From your bank"}</Detail>
          {!t.isManual && original !== displayName && <Detail label="Bank's name">{original}</Detail>}
        </dl>

        {isCardPaymentRow(t, cards) && <CardPaymentButton payment={t} transactions={transactions} cards={cards} labeled />}

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Edit</p>
          {t.isManual && t.manualSource ? (
            <ManualTransactionForm transaction={t.manualSource} paidBack={t.paid_back ?? null} onDone={onClose} />
          ) : (
            <EditTransactionForm
              transaction={{
                id: t.id,
                displayName,
                originalDisplayName: original,
                ruleSeed: t.original_merchant_name || humanizeTransactionName({ ...t, merchant_name: t.original_merchant_name ?? null }),
                categoryOverride: t.category_override ?? null,
                notes: t.notes ?? null,
                edited: Boolean(t.edited),
                amount: t.amount,
                paidBack: t.paid_back ?? null,
              }}
              onDone={onClose}
            />
          )}
        </div>
      </SheetBody>
    </>
  );
}

/**
 * A list of transactions in a card: by day with each day's net when it's
 * sorted by date, otherwise one list with the date on each row.
 */
export function TransactionDayList({
  rows,
  byDate,
  institutions,
  onOpen,
  empty = "No transactions match these filters.",
  label = "Transactions list",
}: {
  rows: TransactionRow[];
  byDate: boolean;
  institutions: Record<string, string>;
  onOpen: (id: string) => void;
  empty?: string;
  label?: string;
}) {
  const days = useMemo(() => (byDate ? groupByDay(rows) : null), [byDate, rows]);
  const list = (items: TransactionRow[], showDate: boolean) => (
    <ul>
      {items.map((t) => (
        <Row key={t.id} t={t} showDate={showDate} institutions={institutions} onOpen={onOpen} />
      ))}
    </ul>
  );
  return (
    <Card className="gap-0 py-0" aria-label={label}>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>
      ) : days ? (
        days.map((d) => (
          <section key={d.date} aria-label={longDay(d.date)} className="border-t border-border first:border-t-0">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 py-2 pr-11 pl-4 text-xs">
              <h2 className="font-medium text-muted-foreground">{longDay(d.date)}</h2>
              <span className={cn("font-mono tabular-nums", d.net > 0 ? "text-moss" : "text-muted-foreground")}>
                {d.net > 0 ? "+" : d.net < 0 ? "−" : ""}
                {formatCurrency(Math.abs(d.net), "USD")}
              </span>
            </div>
            {list(d.rows, false)}
          </section>
        ))
      ) : (
        list(rows, true)
      )}
    </Card>
  );
}

/**
 * Which transaction's panel is open, for a page with a list. Each opening
 * gets a fresh key, so the panel's form starts from the row every time.
 */
export function useTransactionPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState(0);
  return {
    openId,
    openKey: `${openId}:${openCount}`,
    open: (id: string) => {
      setOpenCount((n) => n + 1);
      setOpenId(id);
    },
    close: () => setOpenId(null),
  };
}

/** The panel that slides in from the right for the open transaction. */
export function TransactionSheet({
  transaction,
  openKey,
  onClose,
  transactions,
  cards,
  institutions,
}: {
  transaction: TransactionRow | null;
  openKey: string;
  onClose: () => void;
  transactions: TransactionRow[];
  cards: StatementCard[];
  institutions: Record<string, string>;
}) {
  return (
    <Sheet open={transaction !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        // Focus the panel, not its first field, so a phone's keyboard doesn't cover it on open.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {transaction && (
          <TransactionPanel
            key={openKey}
            t={transaction}
            transactions={transactions}
            cards={cards}
            institutions={institutions}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

export function TransactionsExplorer({
  transactions,
  accounts,
  cards = [],
  rules,
  institutions,
  initialAccount = "all",
}: {
  transactions: TransactionRow[];
  accounts: AccountOption[];
  // Credit cards, so a card payment can show what it paid for.
  cards?: StatementCard[];
  rules: MerchantRule[];
  // The bank each account is at, by account id, for its mark.
  institutions: Record<string, string>;
  // An account to start filtered to (from a link on Accounts).
  initialAccount?: string;
}) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>(initialAccount);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [listOptions, setListOptions] = useState<ListOptions>(DEFAULT_LIST_OPTIONS);
  const panel = useTransactionPanel();

  const categories = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(effectiveCategory(t) ?? "(uncategorized)");
    return Array.from(present)
      .sort()
      .map((c) => ({ value: c, label: c === "(uncategorized)" ? "Uncategorized" : humanizeCategory(c) }));
  }, [transactions]);

  // Distinct months actually present in the data, newest first.
  const months = useMemo(() => {
    const present = new Set<string>();
    for (const t of transactions) present.add(t.date.slice(0, 7));
    return Array.from(present)
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({
        value: m,
        label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      }));
  }, [transactions]);

  // Filtering happens client-side, which is fine at this volume.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (accountFilter === MANUAL_ACCOUNT_ID) {
        if (t.account !== null) return false;
      } else if (accountFilter !== "all" && t.account?.id !== accountFilter) {
        return false;
      }
      if (categoryFilter !== "all" && (effectiveCategory(t) ?? "(uncategorized)") !== categoryFilter) return false;
      if (monthFilter !== "all" && t.date.slice(0, 7) !== monthFilter) return false;
      if (q) {
        const haystack = `${humanizeTransaction(t).displayName} ${t.merchant_name ?? ""} ${t.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, accountFilter, categoryFilter, monthFilter, search]);

  // The Filters menu (sort, money in/out, amount, status, transfers, notes)
  // applies on top. Sorting always happens here: `transactions` merges
  // Plaid and manual rows, which aren't interleaved by date.
  const sorted = useMemo(() => applyListOptions(filtered, listOptions), [filtered, listOptions]);
  const byDate = listOptions.sort === "newest" || listOptions.sort === "oldest";

  const accountOptions = useMemo(
    () => [...accounts, MANUAL_ACCOUNT_OPTION].map((a) => ({ value: a.id, label: accountLabel(a) })),
    [accounts]
  );

  const open = panel.openId ? (transactions.find((t) => t.id === panel.openId) ?? null) : null;

  // Exports exactly what's on screen, every filter and the sort applied.
  function exportCsv() {
    const headers = ["Date", "Merchant", "Category", "Account", "Amount", "Paid back in cash", "Pending", "Source", "Notes"];
    const rows = sorted.map((t) => {
      const { displayName, displayCategoryLabel } = humanizeTransaction(t);
      return [
        t.date,
        displayName,
        displayCategoryLabel,
        accountText(t),
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
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-center justify-between gap-3 md:pr-12">
        <h1 className="font-serif text-2xl font-semibold text-bone">Transactions</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search"
              placeholder="Search transactions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8"
            />
          </div>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger aria-label="Date" className="min-w-36">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="all">All time</SelectItem>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TransactionFiltersMenu
            options={listOptions}
            onChange={setListOptions}
            account={{ options: accountOptions, value: accountFilter, onChange: setAccountFilter }}
            category={{ options: categories, value: categoryFilter, onChange: setCategoryFilter }}
          />
          <MerchantRulesButton rules={rules} />
          <AddManualTransactionButton />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <TransactionDayList rows={sorted} byDate={byDate} institutions={institutions} onOpen={panel.open} />

        <div className="lg:sticky lg:top-6">
          <Summary rows={sorted} onExport={exportCsv} />
        </div>
      </div>

      <TransactionSheet
        transaction={open}
        openKey={panel.openKey}
        onClose={panel.close}
        transactions={transactions}
        cards={cards}
        institutions={institutions}
      />
    </div>
  );
}
