import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CancelSubscriptionSwitch } from "@/components/cancel-subscription-switch";
import { formatCurrency } from "@/lib/format";
import { humanizeFrequency, monthlyFactorForFrequency } from "@/lib/plaid-categories";
import { createAdminClient } from "@/lib/supabase/admin";

type StreamRow = {
  id: string;
  description: string | null;
  merchant_name: string | null;
  frequency: string | null;
  average_amount: number | null;
  last_date: string | null;
  predicted_next_date: string | null;
  is_active: boolean;
  user_marked_cancelled: boolean;
  account: { name: string; mask: string | null } | null;
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StreamRowView({ stream }: { stream: StreamRow }) {
  const label = stream.merchant_name || stream.description || "Unknown";
  const accountLabel = stream.account
    ? `${stream.account.name}${stream.account.mask ? ` ••${stream.account.mask}` : ""}`
    : "Unknown account";

  return (
    <div className="flex items-center justify-between border-t py-3 first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {accountLabel} · {humanizeFrequency(stream.frequency)} · last {formatDate(stream.last_date)}
          {stream.predicted_next_date ? ` · next ~${formatDate(stream.predicted_next_date)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <p className="text-sm font-medium">{formatCurrency(stream.average_amount ?? 0, "USD")}</p>
        {stream.is_active && (
          <CancelSubscriptionSwitch streamId={stream.id} cancelled={stream.user_marked_cancelled} />
        )}
      </div>
    </div>
  );
}

export default async function SubscriptionsPage() {
  const admin = createAdminClient();

  // Only outflow streams: inflow streams (payroll, interest credits) are
  // money coming in, not subscriptions someone would want to cancel.
  const { data, error } = await admin
    .from("recurring_streams")
    .select(
      "id, description, merchant_name, frequency, average_amount, last_date, predicted_next_date, is_active, user_marked_cancelled, account:accounts(name, mask)"
    )
    .eq("direction", "outflow");

  if (error) console.error("Failed to load recurring streams", error);

  const streams = (data ?? []) as unknown as StreamRow[];

  const active = streams
    .filter((s) => s.is_active && !s.user_marked_cancelled)
    .sort((a, b) => (b.average_amount ?? 0) - (a.average_amount ?? 0));

  // Plaid's own TOMBSTONED/etc. (is_active=false) and a manual cancel both
  // land here — the manual override is separate from Plaid's status per the
  // schema, but both mean "not a current cost" for this view.
  const inactive = streams.filter((s) => !s.is_active || s.user_marked_cancelled);

  const monthlyTotal = active.reduce(
    (sum, s) => sum + (s.average_amount ?? 0) * monthlyFactorForFrequency(s.frequency),
    0
  );
  const annualTotal = monthlyTotal * 12;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Subscriptions</h1>

      <Card>
        <CardHeader>
          <CardTitle>Active subscriptions cost</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-8">
          <div>
            <p className="text-xs text-muted-foreground">Monthly</p>
            <p className="text-2xl font-semibold">{formatCurrency(monthlyTotal, "USD")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Annualized</p>
            <p className="text-2xl font-semibold">{formatCurrency(annualTotal, "USD")}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive ({inactive.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <Card>
            <CardContent className="pt-6">
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active subscriptions detected yet.</p>
              ) : (
                active.map((s) => <StreamRowView key={s.id} stream={s} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="inactive">
          <Card>
            <CardContent className="pt-6">
              {inactive.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here.</p>
              ) : (
                inactive.map((s) => <StreamRowView key={s.id} stream={s} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
