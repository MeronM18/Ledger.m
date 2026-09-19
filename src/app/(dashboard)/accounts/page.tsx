import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { SyncAllButton } from "@/components/sync-all-button";
import { SyncNowButton } from "@/components/sync-now-button";
import { createAdminClient } from "@/lib/supabase/admin";

type AccountRow = {
  id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
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

export default async function AccountsPage() {
  const admin = createAdminClient();
  const { data: items, error } = await admin
    .from("items")
    .select(
      "id, institution_name, status, error_code, last_synced_at, accounts(id, name, official_name, mask, type, subtype, current_balance, available_balance, iso_currency_code)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load accounts", error);
  }

  const rows = (items ?? []) as unknown as ItemRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-bone">Accounts</h1>
        <div className="flex items-center gap-2">
          <SyncAllButton items={rows.map((item) => ({ id: item.id, institution_name: item.institution_name }))} />
          <PlaidLinkButton />
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No accounts connected yet. Use the button above to connect one via Plaid.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((item) => (
          <Card key={item.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle>{item.institution_name ?? "Unknown institution"}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {item.last_synced_at
                    ? `Last synced ${new Date(item.last_synced_at).toLocaleString()}`
                    : "Never synced"}
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
                      {account.name}
                      {account.mask ? ` ••${account.mask}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.type}
                      {account.subtype ? ` · ${account.subtype}` : ""}
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
    </div>
  );
}
