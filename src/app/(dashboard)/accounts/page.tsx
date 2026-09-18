import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaidLinkButton } from "@/components/plaid-link-button";
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
  accounts: AccountRow[];
};

function formatBalance(amount: number | null, currency: string | null) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
  }).format(amount);
}

export default async function AccountsPage() {
  const admin = createAdminClient();
  const { data: items, error } = await admin
    .from("items")
    .select(
      "id, institution_name, status, accounts(id, name, official_name, mask, type, subtype, current_balance, available_balance, iso_currency_code)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load accounts", error);
  }

  const rows = (items ?? []) as unknown as ItemRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <PlaidLinkButton />
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
              <CardTitle>{item.institution_name ?? "Unknown institution"}</CardTitle>
              <Badge variant={item.status === "active" ? "default" : "destructive"}>
                {item.status}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {item.accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between border-t pt-3 first:border-t-0 first:pt-0"
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
                  <p className="text-sm font-medium">
                    {formatBalance(account.current_balance, account.iso_currency_code)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
