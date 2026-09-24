import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LastSyncedLabel } from "@/components/last-synced-label";
import { Money } from "@/components/money";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { QueryErrorState } from "@/components/query-error";
import { SyncAllButton } from "@/components/sync-all-button";
import { SyncNowButton } from "@/components/sync-now-button";
import { ReconnectButton } from "@/components/reconnect-button";
import { StatementImportDialog } from "@/components/statement-import-dialog";
import { isDisconnected, needsReconnect, statusLabel } from "@/lib/item-status";
import { CreditUtilizationCard } from "@/components/credit-utilization-card";
import { summarizeUtilization } from "@/lib/credit-utilization";
import { formatCurrency } from "@/lib/format";
import { AccountApyButton } from "@/components/account-apy-button";
import { AppleAccountCard, AppleEmptyCard, AppleImportButton, type AppleCard } from "@/components/apple-account-cards";
import { DragHandle, SortableCardList, type SortableCard } from "@/components/sortable-card-list";
import { applyCardOrder } from "@/lib/card-order";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { importStatus } from "@/lib/import-reminders";
import { calendarNow } from "@/lib/time";
import { loadAccountSettings, loadCardOrder } from "@/lib/ui-preferences";
import { accountName, type AccountSettings } from "@/lib/account-settings";
import { AccountSettingsButton } from "@/components/account-settings-button";
import { closeDayFor } from "@/lib/card-statements";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { prettyName } from "@/lib/transaction-display";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

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

const LIABILITY_TYPES = new Set(["credit", "loan"]);

function statusBadgeVariant(item: ItemRow): "default" | "destructive" | "secondary" {
  if (item.status === "active") return "default";
  if (isDisconnected(item) || item.status === "error") return "destructive";
  return "secondary";
}

function formatHistoryStart(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

type CloseDayGuess = { day: number; from: "payments" | "due-date" } | null;

function InstitutionCard({
  item,
  earliestDate,
  settings,
  guesses,
}: {
  item: ItemRow;
  earliestDate: string | null;
  settings: AccountSettings;
  // For each card with no closing day set, the day used in its place.
  guesses: Record<string, CloseDayGuess>;
}) {
  // Where past statements can go: checking first, then savings.
  const depository = item.accounts
    .filter((a) => a.type === "depository")
    .sort((a, b) => Number(b.subtype === "checking") - Number(a.subtype === "checking"))
    .map((a) => ({ id: a.id, name: accountName(a, settings[a.id]), mask: a.mask }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <DragHandle />
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>{item.institution_name ?? "Unknown institution"}</CardTitle>
            <p className="text-xs text-muted-foreground">
              <LastSyncedLabel timestamp={item.last_synced_at} />
              {" · "}
              {earliestDate ? `History from ${formatHistoryStart(earliestDate)}` : "No transaction history yet"}
              {item.error_code && !needsReconnect(item) ? ` · ${item.error_code}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusBadgeVariant(item)}>{statusLabel(item)}</Badge>
          {needsReconnect(item) ? (
            <ReconnectButton itemId={item.id} institutionName={item.institution_name ?? "this bank"} />
          ) : (
            <SyncNowButton itemId={item.id} />
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {needsReconnect(item) && (
          <p className="rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-sm text-bone">
            {isDisconnected(item)
              ? `${item.institution_name ?? "This bank"} signed you out, so it has stopped syncing. Reconnect to sign in again; your accounts and history stay as they are.`
              : `${item.institution_name ?? "This bank"} will stop syncing soon unless you sign in again. Reconnect now to keep it going.`}
          </p>
        )}
        {item.accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {accountName(account, settings[account.id])}
                {account.mask ? ` ••${account.mask}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {account.type}
                {account.subtype ? ` · ${account.subtype}` : ""}
                {account.apy !== null ? ` · ${account.apy}% APY` : ""}
                {account.type === "credit" && account.credit_limit && account.current_balance !== null
                  ? ` · ${Math.round((Math.max(0, Number(account.current_balance)) / Number(account.credit_limit)) * 100)}% of ${formatCurrency(Number(account.credit_limit), account.iso_currency_code)} limit`
                  : ""}
                {account.type === "credit" && statementDays(settings[account.id], guesses[account.id])}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <AccountSettingsButton
                accountId={account.id}
                name={accountName(account, settings[account.id])}
                bankName={prettyName(account.official_name ?? account.name)}
                nickname={settings[account.id]?.nickname ?? null}
                isCard={account.type === "credit"}
                closeDay={settings[account.id]?.statementCloseDay ?? null}
                dueDay={settings[account.id]?.paymentDueDay ?? null}
                suggestedCloseDay={guesses[account.id] ?? null}
              />
              {account.type === "depository" && account.subtype !== "checking" && (
                <AccountApyButton accountId={account.id} name={accountName(account, settings[account.id])} apy={account.apy === null ? null : Number(account.apy)} />
              )}
              {account.current_balance === null ? (
                <span className="font-mono text-sm text-muted-foreground">—</span>
              ) : (
                <Money
                  amount={account.current_balance}
                  currency={account.iso_currency_code}
                  tone={LIABILITY_TYPES.has(account.type) ? "negative" : "positive"}
                  className="text-sm font-medium"
                />
              )}
            </div>
          </div>
        ))}
        {depository.length > 0 && (
          <StatementImportDialog accounts={depository} institutionName={item.institution_name ?? "this bank"} />
        )}
      </CardContent>
    </Card>
  );
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

/** " · closes the 3rd · due the 28th" for a card, "about" when the closing day is a guess. */
function statementDays(setting: AccountSettings[string] | undefined, guess: CloseDayGuess): string {
  const close = setting?.statementCloseDay
    ? ` · closes the ${ordinal(setting.statementCloseDay)}`
    : guess
      ? ` · closes about the ${ordinal(guess.day)}`
      : "";
  const due = setting?.paymentDueDay ? ` · due the ${ordinal(setting.paymentDueDay)}` : "";
  return close + due;
}

export const metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const admin = createAdminClient();
  const [{ data: items, error }, { data: txDates, error: txDatesError }, { accounts: manualCards }, savedOrder, settings, ledger] = await Promise.all([
    admin
      .from("items")
      .select(
        "id, institution_name, status, error_code, last_synced_at, accounts(id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, apy, iso_currency_code)"
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
  ]);

  // The closing day each card uses when you haven't set one.
  const guesses: Record<string, CloseDayGuess> = {};
  for (const card of ledger.cards) {
    if (card.closesAtMonthEnd || card.closeDay) continue;
    const close = closeDayFor(card, ledger.transactions.filter((t) => t.account?.id === card.id));
    if (close && (close.source === "payments" || close.source === "due-date")) guesses[card.id] = { day: close.day, from: close.source };
  }

  if (error) {
    console.error("Failed to load accounts", error);
  }
  if (txDatesError) {
    // Non-fatal: the page still works without the history-start line, so
    // this degrades quietly rather than blocking the whole page on a
    // supplementary query.
    console.error("Failed to load transaction dates for history coverage", txDatesError);
  }

  const rows = (items ?? []) as unknown as ItemRow[];

  const earliestDateByItem = new Map<string, string>();
  for (const t of (txDates ?? []) as unknown as { date: string; account: { item_id: string } | null }[]) {
    const itemId = t.account?.item_id;
    if (!itemId) continue;
    // Rows are already ordered by date ascending, so the first one seen
    // per item is its earliest.
    if (!earliestDateByItem.has(itemId)) earliestDateByItem.set(itemId, t.date);
  }

  const utilization = summarizeUtilization([
    // Apple Card, imported from statements, counts like any connected card.
    ...manualCards
      .filter((c) => c.type === "credit")
      .map((c) => ({
        id: `manual:${c.id}`,
        name: c.name,
        mask: c.mask,
        institution: c.institution_name,
        balance: c.balance,
        limit: c.credit_limit,
      })),
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

  // Every card below credit utilization, in the order the user dragged them into.
  const cards: SortableCard[] = applyCardOrder(
    [
      ...(appleCards.length === 0
        ? [{ id: "apple:empty", label: "Apple Card and Apple Savings", node: <AppleEmptyCard /> }]
        : appleCards.map((card) => ({ id: `apple:${card.id}`, label: card.name, node: <AppleAccountCard card={card} hasSavings={appleCards.some((c) => c.type === "depository")} /> }))),
      ...rows.map((item) => ({
        id: `item:${item.id}`,
        label: item.institution_name ?? "Unknown institution",
        node: (
          <InstitutionCard item={item} earliestDate={earliestDateByItem.get(item.id) ?? null} settings={settings} guesses={guesses} />
        ),
      })),
    ],
    (c) => c.id,
    savedOrder
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold text-bone">Accounts</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SyncAllButton items={rows.map((item) => ({ id: item.id, institution_name: item.institution_name }))} />
          {appleCards.length > 0 && <AppleImportButton hasSavings={appleCards.some((c) => c.type === "depository")} />}
          <PlaidLinkButton />
        </div>
      </div>

      {error ? (
        <QueryErrorState message="Couldn't load your accounts. Try refreshing the page." />
      ) : (
        <>
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No accounts connected yet. Use the button above to connect one via Plaid.
            </p>
          )}

          <CreditUtilizationCard summary={utilization} currency="USD" />

          <SortableCardList page="accounts" cards={cards} />
        </>
      )}
    </div>
  );
}
