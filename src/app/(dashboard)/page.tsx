import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { computeNetWorth } from "@/lib/net-worth";
import { categoryTotalsForMonth, filterSpendingTransactions } from "@/lib/spending-aggregation";
import { summarizeSubscriptions } from "@/lib/subscriptions-aggregation";
import { humanizeTransactionName } from "@/lib/transaction-display";
import { createAdminClient } from "@/lib/supabase/admin";

type RecentTransaction = {
  id: string;
  date: string;
  name: string | null;
  merchant_name: string | null;
  logo_url: string | null;
  amount: number;
  iso_currency_code: string | null;
  pending: boolean;
};

function SectionLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne"
    >
      View all <ArrowRight className="size-3" />
    </Link>
  );
}

export default async function OverviewPage() {
  const admin = createAdminClient();

  const [
    { data: accountsData, error: acctError },
    { data: manualData, error: manualError },
    { data: txData, error: txError },
    { data: streamsData, error: streamsError },
    { data: manualSubsData, error: manualSubsError },
    { data: recentData, error: recentError },
  ] = await Promise.all([
    admin.from("accounts").select("type, current_balance"),
    admin.from("manual_assets").select("value, is_liability"),
    admin
      .from("transactions")
      .select("date, amount, pfc_primary, merchant_name, name, pending, iso_currency_code"),
    admin
      .from("recurring_streams")
      .select("average_amount, frequency, is_active, user_marked_cancelled")
      .eq("direction", "outflow"),
    admin.from("manual_subscriptions").select("amount, frequency, is_active"),
    admin
      .from("transactions")
      .select("id, date, name, merchant_name, logo_url, amount, iso_currency_code, pending")
      .order("date", { ascending: false })
      .limit(5),
  ]);

  if (acctError) console.error("Failed to load accounts for overview", acctError);
  if (manualError) console.error("Failed to load manual assets for overview", manualError);
  if (txError) console.error("Failed to load transactions for overview", txError);
  if (streamsError) console.error("Failed to load recurring streams for overview", streamsError);
  if (manualSubsError) console.error("Failed to load manual subscriptions for overview", manualSubsError);
  if (recentError) console.error("Failed to load recent transactions for overview", recentError);

  const { netWorth } = computeNetWorth(accountsData ?? [], manualData ?? []);

  const allTransactions = txData ?? [];
  const currency = allTransactions[0]?.iso_currency_code ?? "USD";
  const spending = filterSpendingTransactions(allTransactions);
  const now = new Date();
  const categoryTotals = categoryTotalsForMonth(spending, now.getFullYear(), now.getMonth());
  const monthTotal = categoryTotals.reduce((sum, c) => sum + c.amount, 0);
  const topCategories = [...categoryTotals].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const manualSubsAsStreams = (manualSubsData ?? []).map((m) => ({
    average_amount: m.amount,
    frequency: m.frequency,
    is_active: m.is_active,
    user_marked_cancelled: false,
  }));
  const { active, monthlyTotal } = summarizeSubscriptions([
    ...(streamsData ?? []),
    ...manualSubsAsStreams,
  ]);

  const recent = (recentData ?? []) as RecentTransaction[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-bone">Overview</h1>

      <Card className="border-champagne/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Net worth</CardTitle>
          <SectionLink href="/assets" />
        </CardHeader>
        <CardContent>
          <span
            className={`font-serif text-3xl font-semibold tabular-nums ${
              netWorth < 0 ? "text-oxblood" : "text-moss"
            }`}
          >
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(netWorth)}
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{monthLabel} spending</CardTitle>
            <SectionLink href="/spending" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Money amount={monthTotal} currency={currency} tone="negative" className="text-2xl font-semibold" />
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No spending recorded yet.</p>
            ) : (
              <div className="flex flex-col">
                {topCategories.map((c) => (
                  <div
                    key={c.category}
                    className="flex items-center justify-between border-t border-border py-2 first:border-t-0 first:pt-0"
                  >
                    <span className="text-sm text-muted-foreground">{c.label}</span>
                    <Money amount={c.amount} currency={currency} tone="negative" className="text-sm font-medium" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Subscriptions</CardTitle>
            <SectionLink href="/subscriptions" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Monthly cost</p>
              <Money amount={monthlyTotal} tone="negative" className="text-2xl font-semibold" />
            </div>
            <p className="text-sm text-muted-foreground">
              {active.length} active subscription{active.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent transactions</CardTitle>
          <SectionLink href="/transactions" />
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="flex flex-col">
              {recent.map((t) => {
                const isDebit = t.amount >= 0; // Plaid: positive = money out
                const merchant = humanizeTransactionName(t);

                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center gap-3">
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
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {merchant}
                        {t.pending && (
                          <Badge variant="secondary" className="text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </span>
                    </div>
                    <Money
                      amount={t.amount}
                      currency={t.iso_currency_code}
                      tone={isDebit ? "negative" : "positive"}
                      showSign
                      className="text-sm font-medium"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
