import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { QueryErrorState } from "@/components/query-error";
import { SyncAllButton } from "@/components/sync-all-button";
import { SyncNowButton } from "@/components/sync-now-button";
import { ReconnectButton } from "@/components/reconnect-button";
import { StatementImportDialog } from "@/components/statement-import-dialog";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { AccountsBoard, AccountsSummary, Ago } from "@/components/accounts-board";
import { isDisconnected, needsReconnect, statusLabel } from "@/lib/item-status";
import { CreditUtilizationCard } from "@/components/credit-utilization-card";
import { summarizeUtilization } from "@/lib/credit-utilization";
import { AccountApyButton } from "@/components/account-apy-button";
import { AppleDeleteButton, AppleEditButton, AppleImportButton, ImportTracking, type AppleCard } from "@/components/apple-account-cards";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { importStatus } from "@/lib/import-reminders";
import { calendarNow } from "@/lib/time";
import { loadAccountSettings, loadCardOrder } from "@/lib/ui-preferences";
import { accountName } from "@/lib/account-settings";
import { AccountSettingsButton } from "@/components/account-settings-button";
import { closeDayFor } from "@/lib/card-statements";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { prettyName } from "@/lib/transaction-display";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildBoard, historyStartFor, type BoardRow, type ManualAssetInput } from "@/lib/accounts-board";
import { MAX_HISTORY_DAYS, type HistoryTx } from "@/lib/account-history";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";

type AccountRow = {
  id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  apy: number | null;
  is_hidden: boolean | null;
  iso_currency_code: string | null;
};

type ItemRow = {
  id: string;
  institution_name: string | null;
  status: string;
  error_code: string | null;
  last_synced_at: string | null;
  accounts: AccountRow[];
};

type CloseDayGuess = { day: number; from: "payments" | "due-date" } | null;

function statusBadgeVariant(item: ItemRow): "default" | "destructive" | "secondary" {
  if (item.status === "active") return "default";
  if (isDisconnected(item) || item.status === "error") return "destructive";
  return "secondary";
}

function formatHistoryStart(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** One bank's connection: whether it's syncing, since when, and the buttons to sync or sign in again. */
function Connection({ item, earliestDate, settings }: { item: ItemRow; earliestDate: string | null; settings: Awaited<ReturnType<typeof loadAccountSettings>> }) {
  const name = item.institution_name ?? "Unknown institution";
  // Where past statements can go: checking first, then savings.
  const depository = item.accounts
    .filter((a) => a.type === "depository")
    .sort((a, b) => Number(b.subtype === "checking") - Number(a.subtype === "checking"))
    .map((a) => ({ id: a.id, name: accountName(a, settings[a.id]), mask: a.mask }));

  return (
    <li data-connection={name} className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <InstitutionAvatar institution={name} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {name}
            <Badge variant={statusBadgeVariant(item)}>{statusLabel(item)}</Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            {item.last_synced_at ? <Ago prefix="Synced" at={item.last_synced_at} /> : "Never synced"}
            {" · "}
            {earliestDate ? `History from ${formatHistoryStart(earliestDate)}` : "No transaction history yet"}
            {item.error_code && !needsReconnect(item) ? ` · ${item.error_code}` : ""}
          </p>
        </div>
      </div>
      {needsReconnect(item) && (
        <p className="rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-xs text-bone">
          {isDisconnected(item)
            ? `${name} signed you out, so it has stopped syncing. Reconnect to sign in again; your accounts and history stay as they are.`
            : `${name} will stop syncing soon unless you sign in again. Reconnect now to keep it going.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {needsReconnect(item) ? <ReconnectButton itemId={item.id} institutionName={name} /> : <SyncNowButton itemId={item.id} />}
        {depository.length > 0 && <StatementImportDialog accounts={depository} institutionName={name} />}
      </div>
    </li>
  );
}

export const metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const admin = createAdminClient();
  const [
    { data: items, error },
    { data: txDates, error: txDatesError },
    { accounts: manualCards },
    savedOrder,
    settings,
    ledger,
    { data: assetRows, error: assetsError },
    { data: holdingsData },
    { data: pricesData },
  ] = await Promise.all([
    admin
      .from("items")
      .select(
        "id, institution_name, status, error_code, last_synced_at, accounts(id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, apy, is_hidden, iso_currency_code)"
      )
      .order("created_at", { ascending: false }),
    // Earliest transaction per item — surfaces how much history Plaid
    // actually returned (days_requested is a request, not a guarantee, and
    // it varies a lot by institution) rather than leaving that invisible.
    fetchAllRows((from, to) =>
      admin
        .from("transactions")
        .select("date, account:accounts(item_id)")
        .order("date", { ascending: true })
        .order("id")
        .range(from, to)
    ),
    loadManualAccounts(admin),
    loadCardOrder(admin, "accounts"),
    loadAccountSettings(admin),
    loadLedger(admin),
    admin.from("manual_assets").select("id, name, category, value, is_liability, updated_at").order("created_at"),
    admin.from("precious_metal_holdings").select("metal, weight, weight_unit, purity"),
    admin.from("metal_prices").select("metal, price_per_troy_oz_usd, fetched_at"),
  ]);

  if (error) console.error("Failed to load accounts", error);
  if (assetsError) console.error("Failed to load manual assets", assetsError);
  if (txDatesError) {
    // Non-fatal: the page still works without the history-start line.
    console.error("Failed to load transaction dates for history coverage", txDatesError);
  }

  const rows = (items ?? []) as unknown as ItemRow[];

  const earliestDateByItem = new Map<string, string>();
  for (const t of (txDates ?? []) as unknown as { date: string; account: { item_id: string } | null }[]) {
    const itemId = t.account?.item_id;
    if (!itemId) continue;
    // Rows are already ordered by date ascending, so the first one seen per item is its earliest.
    if (!earliestDateByItem.has(itemId)) earliestDateByItem.set(itemId, t.date);
  }

  // The closing day each card uses when you haven't set one.
  const guesses: Record<string, CloseDayGuess> = {};
  for (const card of ledger.cards) {
    if (card.closesAtMonthEnd || card.closeDay) continue;
    const close = closeDayFor(card, ledger.transactions.filter((t) => t.account?.id === card.id));
    if (close && (close.source === "payments" || close.source === "due-date")) guesses[card.id] = { day: close.day, from: close.source };
  }

  const utilization = summarizeUtilization([
    // Apple Card, imported from statements, counts like any connected card.
    ...manualCards
      .filter((c) => c.type === "credit")
      .map((c) => ({ id: `manual:${c.id}`, name: c.name, mask: c.mask, institution: c.institution_name, balance: c.balance, limit: c.credit_limit })),
    ...rows.flatMap((item) =>
      item.accounts
        .filter((a) => a.type === "credit")
        .map((a) => ({
          id: a.id,
          name: accountName(a, settings[a.id]),
          mask: a.mask,
          institution: item.institution_name,
          balance: a.current_balance === null ? null : Number(a.current_balance),
          limit: a.credit_limit === null ? null : Number(a.credit_limit),
        }))
    ),
  ]);

  const today = calendarNow().isoDate;

  // Every posted transaction, by account, to work balances back in time.
  const transactionsByAccount = new Map<string, HistoryTx[]>();
  for (const t of ledger.transactions) {
    if (!t.account) continue;
    const list = transactionsByAccount.get(t.account.id) ?? [];
    list.push({ date: t.posted_date ?? t.date, amount: t.amount, pending: t.pending });
    transactionsByAccount.set(t.account.id, list);
  }
  const historyStart = historyStartFor(transactionsByAccount, today, MAX_HISTORY_DAYS);

  const holdings = holdingsData ?? [];
  const prices = pricesData ?? [];
  const pricedAt = prices.map((p) => p.fetched_at as string | null).filter(Boolean).sort().at(-1) ?? null;

  const board: BoardRow[] = buildBoard({
    plaid: rows.flatMap((item) =>
      item.accounts.map((a) => ({
        ...a,
        current_balance: a.current_balance === null ? null : Number(a.current_balance),
        credit_limit: a.credit_limit === null ? null : Number(a.credit_limit),
        apy: a.apy === null ? null : Number(a.apy),
        institution: item.institution_name,
        last_synced_at: item.last_synced_at,
      }))
    ),
    manualAccounts: manualCards,
    assets: ((assetRows ?? []) as ManualAssetInput[]).map((a) => ({ ...a, value: Number(a.value) })),
    metals: { value: totalPreciousMetalsValue(holdings, prices), count: holdings.length, pricedAt },
    settings,
    transactions: transactionsByAccount,
    todayIso: today,
    historyStart,
  });

  const appleCards: AppleCard[] = manualCards.map((c) => ({
    id: c.id,
    type: c.type,
    name: c.name,
    balance: c.balance,
    balanceKnown: c.balanceKnown,
    earned: c.earned,
    apy: c.apy,
    creditLimit: c.credit_limit,
    hasBalanceOverride: c.balance_override !== null,
    balanceOverride: c.balance_override,
    transactionCount: c.transactionCount,
    lastTransactionDate: c.lastTransactionDate,
    importStatus: importStatus(c.lastImportedAt, today),
    imports: c.imports,
  }));
  const hasSavings = appleCards.some((c) => c.type === "depository");
  const plaidAccounts = new Map(rows.flatMap((item) => item.accounts.map((a) => [a.id, a] as const)));

  // Each row's buttons: rename a bank account (and its statement days), its
  // interest rate, an Apple account's balance and limit, or a link to Assets.
  const actions: Record<string, React.ReactNode> = {};
  for (const row of board) {
    const ref = row.ref;
    if (ref.type === "plaid") {
      const a = plaidAccounts.get(ref.accountId)!;
      actions[row.id] = (
        <>
          <AccountSettingsButton
            accountId={a.id}
            name={row.name}
            bankName={prettyName(a.official_name ?? a.name)}
            nickname={settings[a.id]?.nickname ?? null}
            isCard={ref.isCard}
            closeDay={settings[a.id]?.statementCloseDay ?? null}
            dueDay={settings[a.id]?.paymentDueDay ?? null}
            suggestedCloseDay={guesses[a.id] ?? null}
          />
          {a.type === "depository" && a.subtype !== "checking" && <AccountApyButton accountId={a.id} name={row.name} apy={ref.apy} />}
        </>
      );
    } else if (ref.type === "apple") {
      const card = appleCards.find((c) => c.id === ref.manualId)!;
      actions[row.id] = (
        <>
          <AppleEditButton card={card} />
          <AppleDeleteButton card={card} />
        </>
      );
    } else {
      actions[row.id] = (
        <Button asChild size="icon" variant="ghost" aria-label={`Edit ${row.name} in Assets`}>
          <Link href="/assets">
            <Pencil className="size-3.5" />
          </Link>
        </Button>
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-center justify-between gap-3 md:pr-12">
        <h1 className="font-serif text-2xl font-semibold text-bone">Accounts</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SyncAllButton
            items={rows.map((item) => ({ id: item.id, institution_name: item.institution_name }))}
            activeCount={rows.filter((item) => item.status === "active").length}
          />
          <AppleImportButton hasSavings={hasSavings} />
          <PlaidLinkButton />
        </div>
      </div>

      {error ? (
        <QueryErrorState message="Couldn't load your accounts. Try refreshing the page." />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <AccountsBoard rows={board} actions={actions} historyStart={historyStart} savedOrder={savedOrder} />

          <aside className="flex min-w-0 flex-col gap-4">
            <AccountsSummary rows={board} />
            <CreditUtilizationCard summary={utilization} currency="USD" />

            <Card>
              <CardHeader>
                <CardTitle>Connections</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Banks sync on their own through the day. Sync now asks for anything new right away.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col">
                  {rows.map((item) => (
                    <Connection key={item.id} item={item} earliestDate={earliestDateByItem.get(item.id) ?? null} settings={settings} />
                  ))}
                  {appleCards.map((card) => (
                    <li key={card.id} data-connection={card.name} className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <InstitutionAvatar institution="Apple" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <p className="text-sm font-medium">{card.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Imported from statements · {card.transactionCount} transactions
                          </p>
                        </div>
                      </div>
                      <ImportTracking card={card} hasSavings={hasSavings} />
                    </li>
                  ))}
                  {appleCards.length === 0 && (
                    <li className="flex flex-col gap-2 border-t border-border py-3 text-xs text-muted-foreground first:border-t-0 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium text-foreground">Apple Card and Apple Savings</p>
                      Apple&apos;s accounts can&apos;t connect automatically. Import the CSV export from Wallet with Import
                      statement above and they count everywhere.
                    </li>
                  )}
                </ul>
                {rows.length === 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">No banks connected yet. Use Add account to connect one through Plaid.</p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
