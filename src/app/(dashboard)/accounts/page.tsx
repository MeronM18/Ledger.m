import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LastSyncedLabel } from "@/components/last-synced-label";
import { Money } from "@/components/money";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { QueryErrorState } from "@/components/query-error";
import { SyncAllButton } from "@/components/sync-all-button";
import { SyncNowButton } from "@/components/sync-now-button";
import { CreditUtilizationCard } from "@/components/credit-utilization-card";
import { summarizeUtilization } from "@/lib/credit-utilization";
import { formatCurrency } from "@/lib/format";
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

function statusBadgeVariant(status: string): "default" | "destructive" | "secondary" {
  if (status === "active") return "default";
  if (status === "requires_reauth" || status === "error") return "destructive";
  return "secondary";
}

function formatHistoryStart(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export const metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const admin = createAdminClient();
  const [{ data: items, error }, { data: txDates, error: txDatesError }] = await Promise.all([
    admin
      .from("items")
      .select(
        "id, institution_name, status, error_code, last_synced_at, accounts(id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, iso_currency_code)"
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
  ]);

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

  const utilization = summarizeUtilization(
    rows.flatMap((item) =>
      item.accounts
        .filter((a) => a.type === "credit")
        .map((a) => ({
          id: a.id,
          name: prettyName(a.name),
          mask: a.mask,
          institution: item.institution_name,
          balance: a.current_balance === null ? null : Number(a.current_balance),
          limit: a.credit_limit === null ? null : Number(a.credit_limit),
        }))
    )
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold text-bone">Accounts</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SyncAllButton items={rows.map((item) => ({ id: item.id, institution_name: item.institution_name }))} />
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

          <div className="flex flex-col gap-4">
            {rows.map((item) => (
              <Card key={item.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <CardTitle>{item.institution_name ?? "Unknown institution"}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      <LastSyncedLabel timestamp={item.last_synced_at} />
                      {" · "}
                      {earliestDateByItem.has(item.id)
                        ? `History from ${formatHistoryStart(earliestDateByItem.get(item.id)!)}`
                        : "No transaction history yet"}
                      {item.error_code ? ` · ${item.error_code}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                    <SyncNowButton itemId={item.id} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {item.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between border-t border-border pt-3 first:border-t-0 first:pt-0"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {prettyName(account.name)}
                          {account.mask ? ` ••${account.mask}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account.type}
                          {account.subtype ? ` · ${account.subtype}` : ""}
                          {account.type === "credit" && account.credit_limit && account.current_balance !== null
                            ? ` · ${Math.round((Math.max(0, Number(account.current_balance)) / Number(account.credit_limit)) * 100)}% of ${formatCurrency(Number(account.credit_limit), account.iso_currency_code)} limit`
                            : ""}
                        </p>
                      </div>
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
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
