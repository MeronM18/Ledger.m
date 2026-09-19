import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManualAssetsManager, type ManualAsset } from "@/components/manual-assets-manager";
import { Money } from "@/components/money";
import { createAdminClient } from "@/lib/supabase/admin";

type AccountRow = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  iso_currency_code: string | null;
};

// Plaid AccountType: investment, credit, depository, loan, brokerage, other.
// credit/loan balances are amounts owed (liabilities); everything else is a
// balance you hold (an asset). "other" defaults to asset — there's no
// general rule for it, and most real "other" accounts (e.g. prepaid) behave
// like an asset.
const LIABILITY_TYPES = new Set(["credit", "loan"]);

function isLiabilityAccount(type: string): boolean {
  return LIABILITY_TYPES.has(type);
}

export default async function AssetsPage() {
  const admin = createAdminClient();

  const [{ data: accountsData, error: acctError }, { data: manualData, error: manualError }] =
    await Promise.all([
      admin
        .from("accounts")
        .select("id, name, mask, type, subtype, current_balance, iso_currency_code")
        .order("name"),
      admin
        .from("manual_assets")
        .select("id, name, category, value, is_liability, notes")
        .order("created_at", { ascending: false }),
    ]);

  if (acctError) console.error("Failed to load accounts", acctError);
  if (manualError) console.error("Failed to load manual assets", manualError);

  const accounts = (accountsData ?? []) as AccountRow[];
  const manualAssets = (manualData ?? []) as ManualAsset[];

  const plaidAssetAccounts = accounts.filter((a) => !isLiabilityAccount(a.type));
  const plaidLiabilityAccounts = accounts.filter((a) => isLiabilityAccount(a.type));

  const totalPlaidAssets = plaidAssetAccounts.reduce((sum, a) => sum + (a.current_balance ?? 0), 0);
  const totalPlaidLiabilities = plaidLiabilityAccounts.reduce(
    (sum, a) => sum + (a.current_balance ?? 0),
    0
  );

  const totalManualAssets = manualAssets
    .filter((a) => !a.is_liability)
    .reduce((sum, a) => sum + a.value, 0);
  const totalManualLiabilities = manualAssets
    .filter((a) => a.is_liability)
    .reduce((sum, a) => sum + a.value, 0);

  const totalAssets = totalPlaidAssets + totalManualAssets;
  const totalLiabilities = totalPlaidLiabilities + totalManualLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Assets</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Money amount={totalAssets} tone="positive" className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total liabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Money amount={totalLiabilities} tone="negative" className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        {/* The one large hero number in the app: Bodoni Moda instead of
            mono, still sage/brick by sign. */}
        <Card className="border-champagne/40">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Net worth</CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={`font-serif text-3xl font-semibold tabular-nums ${
                netWorth < 0 ? "text-brick" : "text-sage"
              }`}
            >
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                netWorth
              )}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-[0.08em] text-ash-grey uppercase">Assets</h3>
            {plaidAssetAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No asset accounts connected.</p>
            ) : (
              <div className="flex flex-col">
                {plaidAssetAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {a.name}
                        {a.mask ? ` ••${a.mask}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.type}
                        {a.subtype ? ` · ${a.subtype}` : ""}
                      </p>
                    </div>
                    <Money
                      amount={a.current_balance ?? 0}
                      currency={a.iso_currency_code}
                      tone="positive"
                      className="text-sm font-medium"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium tracking-[0.08em] text-ash-grey uppercase">Liabilities</h3>
            {plaidLiabilityAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No liability accounts connected.</p>
            ) : (
              <div className="flex flex-col">
                {plaidLiabilityAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {a.name}
                        {a.mask ? ` ••${a.mask}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.type}
                        {a.subtype ? ` · ${a.subtype}` : ""}
                      </p>
                    </div>
                    <Money
                      amount={a.current_balance ?? 0}
                      currency={a.iso_currency_code}
                      tone="negative"
                      className="text-sm font-medium"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <ManualAssetsManager assets={manualAssets} />
        </CardContent>
      </Card>
    </div>
  );
}
