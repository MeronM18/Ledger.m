import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManualAssetsManager, type ManualAsset } from "@/components/manual-assets-manager";
import { NetWorthChart } from "@/components/net-worth-chart";
import {
  PreciousMetalsManager,
  type MetalPriceRow,
  type PreciousMetalHolding,
} from "@/components/precious-metals-manager";
import { Money } from "@/components/money";
import { QueryErrorState } from "@/components/query-error";
import { computeNetWorth, isLiabilityAccount } from "@/lib/net-worth";
import { totalPreciousMetalsValue } from "@/lib/precious-metals";
import { loadManualAccounts } from "@/lib/manual-accounts";
import { createAdminClient } from "@/lib/supabase/admin";
import { prettyName } from "@/lib/transaction-display";

type AccountRow = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  iso_currency_code: string | null;
};

export const metadata = { title: "Assets" };

export default async function AssetsPage() {
  const admin = createAdminClient();

  const [
    { data: accountsData, error: acctError },
    { data: manualData, error: manualError },
    { data: holdingsData, error: holdingsError },
    { data: pricesData, error: pricesError },
    { data: snapshotsData, error: snapshotsError },
    { accounts: manualCards, error: manualCardsError },
  ] = await Promise.all([
    admin
      .from("accounts")
      .select("id, name, mask, type, subtype, current_balance, iso_currency_code")
      .eq("is_hidden", false)
      .order("name"),
    admin
      .from("manual_assets")
      .select("id, name, category, value, is_liability, notes")
      .order("created_at", { ascending: false }),
    admin
      .from("precious_metal_holdings")
      .select("id, metal, weight, weight_unit, purity, notes")
      .order("created_at", { ascending: false }),
    admin.from("metal_prices").select("metal, price_per_troy_oz_usd, fetched_at"),
    admin.from("net_worth_snapshots").select("date, net_worth").order("date", { ascending: true }),
    loadManualAccounts(admin),
  ]);

  if (acctError) console.error("Failed to load accounts", acctError);
  if (manualError) console.error("Failed to load manual assets", manualError);
  if (holdingsError) console.error("Failed to load precious metal holdings", holdingsError);
  if (pricesError) console.error("Failed to load metal prices", pricesError);
  if (snapshotsError) console.error("Failed to load net worth snapshots", snapshotsError);

  // A manual card (Apple Card) is an account like any other here: listed under
  // liabilities and counted in net worth.
  const accounts = [
    ...((accountsData ?? []) as AccountRow[]),
    ...manualCards
      .filter((c) => c.balanceKnown)
      .map((c) => ({
        id: `manual:${c.id}`,
        name: c.name,
        mask: c.mask,
        type: c.type,
        subtype: c.type === "credit" ? "credit card" : "savings",
        current_balance: c.type === "credit" ? Math.max(0, c.balance) : c.balance,
        iso_currency_code: "USD",
      })),
  ] as AccountRow[];
  const manualAssets = (manualData ?? []) as ManualAsset[];
  const holdings = (holdingsData ?? []) as PreciousMetalHolding[];
  const prices = (pricesData ?? []) as MetalPriceRow[];

  const plaidAssetAccounts = accounts.filter((a) => !isLiabilityAccount(a.type));
  const plaidLiabilityAccounts = accounts.filter((a) => isLiabilityAccount(a.type));

  const preciousMetalsValue = totalPreciousMetalsValue(holdings, prices);

  const { totalAssets, totalLiabilities, netWorth } = computeNetWorth(
    accounts,
    manualAssets,
    preciousMetalsValue
  );

  const hasError = Boolean(acctError || manualError || holdingsError || pricesError || snapshotsError || manualCardsError);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Assets</h1>

      {hasError ? (
        <QueryErrorState message="Couldn't load your assets. Try refreshing the page." />
      ) : (
        <>
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
                mono, still moss/oxblood by sign. */}
            <Card className="border-champagne/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Net worth</CardTitle>
              </CardHeader>
              <CardContent>
                <span
                  className={`font-serif text-3xl font-semibold tabular-nums ${
                    netWorth < 0 ? "text-oxblood-text" : "text-moss"
                  }`}
                >
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                    netWorth
                  )}
                </span>
              </CardContent>
            </Card>
          </div>

          <NetWorthChart
            snapshots={(snapshotsData ?? []).map((s) => ({ date: s.date, netWorth: s.net_worth }))}
          />

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
                            {prettyName(a.name)}
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
                            {prettyName(a.name)}
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
            <CardContent>
              <ManualAssetsManager assets={manualAssets} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <PreciousMetalsManager holdings={holdings} prices={prices} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
