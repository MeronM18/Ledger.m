"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CancelSubscriptionSwitch } from "@/components/cancel-subscription-switch";
import {
  AddManualSubscriptionButton,
  ManualSubscriptionRowActions,
  type ManualSubscription,
} from "@/components/manual-subscription-form";
import { Money } from "@/components/money";
import { FilterBar, type AccountOption } from "@/components/filter-bar";
import { SubscriptionCalendar, type CalendarEvent } from "@/components/subscription-calendar";
import { SubscriptionInsightsCard } from "@/components/subscription-insights-card";
import { formatCurrency } from "@/lib/format";
import { humanizeFrequency } from "@/lib/plaid-categories";
import {
  cancelSearchUrl,
  effectiveNextDate,
  isNewSubscription,
  trialStart,
  type Insight,
} from "@/lib/subscription-insights";
import { calendarNow } from "@/lib/time";
import { streamDisplayName } from "@/lib/transaction-display";
import {
  hasLapsed,
  hasPriceIncrease,
  projectNextOccurrence,
  summarizeSubscriptions,
} from "@/lib/subscriptions-aggregation";

export type StreamRow = {
  id: string;
  description: string | null;
  merchant_name: string | null;
  frequency: string | null;
  average_amount: number | null;
  last_amount: number | null;
  last_date: string | null;
  predicted_next_date: string | null;
  first_date: string | null;
  // Amount of the stream's earliest charge, when its transactions are known.
  firstChargeAmount: number | null;
  is_active: boolean;
  user_marked_cancelled: boolean;
  account: { id: string; name: string; mask: string | null } | null;
};

// The shape summarizeSubscriptions() needs, common to both a Plaid stream
// and a manually-entered subscription — a manual entry has no separate
// user_marked_cancelled concept (its own is_active is the only flag), so it
// normalizes with user_marked_cancelled: false, making
// `is_active && !user_marked_cancelled` collapse to just `is_active`.
type RowItem = {
  key: string;
  source: "plaid" | "manual";
  average_amount: number | null;
  frequency: string | null;
  is_active: boolean;
  user_marked_cancelled: boolean;
  plaidStream?: StreamRow;
  manualSub?: ManualSubscription;
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CancelHelpLink({ name }: { name: string }) {
  return (
    <a
      href={cancelSearchUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-champagne hover:underline"
    >
      How to cancel
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only"> {name} (opens a web search in a new tab)</span>
    </a>
  );
}

function StreamRowView({ stream }: { stream: StreamRow }) {
  const label = streamDisplayName(stream);
  const accountLabel = stream.account
    ? `${stream.account.name}${stream.account.mask ? ` ••${stream.account.mask}` : ""}`
    : "Unknown account";
  const priceIncreased =
    stream.is_active && !stream.user_marked_cancelled && hasPriceIncrease(stream.average_amount, stream.last_amount);
  // Plaid sometimes has no prediction (an annual fee seen once); derive it
  // from the last charge so the row still says when it's due.
  const nextDate = effectiveNextDate(stream.predicted_next_date, stream.last_date, stream.frequency);
  const lapsed = stream.is_active && !stream.user_marked_cancelled && hasLapsed(nextDate);
  const displayNextDate = projectNextOccurrence(nextDate, stream.frequency);
  const isNew = stream.is_active && isNewSubscription(stream.first_date, calendarNow().isoDate);
  const trial = trialStart(stream.firstChargeAmount, stream.average_amount);

  return (
    <div className="flex flex-col gap-3 border-t border-border py-3 transition-colors duration-150 first:border-t-0 first:pt-0 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          {label}
          {priceIncreased && (
            <Badge variant="secondary" className="gap-1 border-oxblood/40 bg-oxblood/10 text-oxblood-text">
              <TrendingUp className="size-3" />
              Price increased
            </Badge>
          )}
          {isNew && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Sparkles className="size-3" />
              New
            </Badge>
          )}
          {lapsed && (
            <Badge variant="secondary" className="gap-1 border-oxblood/40 bg-oxblood/10 text-oxblood-text">
              <AlertTriangle className="size-3" />
              Hasn&apos;t charged recently
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {accountLabel} · {humanizeFrequency(stream.frequency)} · last {formatDate(stream.last_date)}
          {displayNextDate ? ` · next ~${formatDate(displayNextDate)}` : ""}
          {priceIncreased
            ? ` · last charged $${stream.last_amount?.toFixed(2)} (avg $${stream.average_amount?.toFixed(2)})`
            : ""}
          {lapsed ? " · may have lapsed" : ""}
          {trial ? ` · started with a ${formatCurrency(trial.firstAmount, "USD")} charge, likely a trial that converted` : ""}
        </p>
        {stream.is_active && !stream.user_marked_cancelled && <CancelHelpLink name={label} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Money amount={stream.average_amount ?? 0} tone="negative" className="text-sm font-medium" />
        {stream.is_active && (
          <CancelSubscriptionSwitch streamId={stream.id} cancelled={stream.user_marked_cancelled} />
        )}
      </div>
    </div>
  );
}

function ManualSubscriptionRowView({ subscription }: { subscription: ManualSubscription }) {
  const lapsed = subscription.is_active && hasLapsed(subscription.next_billing_date);
  const displayNextDate = projectNextOccurrence(subscription.next_billing_date, subscription.frequency);

  return (
    <div className="flex flex-col gap-3 border-t border-border py-3 transition-colors duration-150 first:border-t-0 first:pt-0 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          {subscription.name}
          <Badge variant="secondary" className="text-[10px]">
            Manual
          </Badge>
          {lapsed && (
            <Badge variant="secondary" className="gap-1 border-oxblood/40 bg-oxblood/10 text-oxblood-text">
              <AlertTriangle className="size-3" />
              Hasn&apos;t charged recently
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {humanizeFrequency(subscription.frequency)}
          {displayNextDate ? ` · next ~${formatDate(displayNextDate)}` : ""}
          {subscription.notes ? ` · ${subscription.notes}` : ""}
          {lapsed ? " · may have lapsed" : ""}
        </p>
        {subscription.is_active && <CancelHelpLink name={subscription.name} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Money amount={subscription.amount} tone="negative" className="text-sm font-medium" />
        <ManualSubscriptionRowActions subscription={subscription} />
      </div>
    </div>
  );
}

export function SubscriptionsExplorer({
  streams,
  manualSubscriptions,
  accounts,
  insights,
  calendarEvents,
  todayIso,
}: {
  streams: StreamRow[];
  manualSubscriptions: ManualSubscription[];
  accounts: AccountOption[];
  insights: Insight[];
  calendarEvents: CalendarEvent[];
  todayIso: string;
}) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const items = useMemo<RowItem[]>(() => {
    // Manual subscriptions aren't tied to any connected account, so an
    // account-scoped filter excludes them entirely; "all accounts" includes
    // both.
    const plaidItems: RowItem[] = streams
      .filter((s) => accountFilter === "all" || s.account?.id === accountFilter)
      .map((s) => ({
        key: `plaid-${s.id}`,
        source: "plaid",
        average_amount: s.average_amount,
        frequency: s.frequency,
        is_active: s.is_active,
        user_marked_cancelled: s.user_marked_cancelled,
        plaidStream: s,
      }));

    const manualItems: RowItem[] =
      accountFilter === "all"
        ? manualSubscriptions.map((m) => ({
            key: `manual-${m.id}`,
            source: "manual",
            average_amount: m.amount,
            frequency: m.frequency,
            is_active: m.is_active,
            user_marked_cancelled: false,
            manualSub: m,
          }))
        : [];

    return [...plaidItems, ...manualItems];
  }, [streams, manualSubscriptions, accountFilter]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const label =
        item.source === "plaid"
          ? streamDisplayName(item.plaidStream!)
          : item.manualSub!.name;
      return label.toLowerCase().includes(q);
    });
  }, [items, search]);

  const { active, inactive, monthlyTotal, annualTotal } = useMemo(
    () => summarizeSubscriptions(filteredItems),
    [filteredItems]
  );

  function renderRow(item: RowItem) {
    return item.source === "plaid" ? (
      <StreamRowView key={item.key} stream={item.plaidStream!} />
    ) : (
      <ManualSubscriptionRowView key={item.key} subscription={item.manualSub!} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        accounts={accounts}
        accountValue={accountFilter}
        onAccountChange={setAccountFilter}
        actions={<AddManualSubscriptionButton />}
      />

      <SubscriptionInsightsCard insights={insights} />

      <Card>
        <CardHeader>
          <CardTitle>Active subscriptions cost</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-8">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Monthly</p>
            <Money amount={monthlyTotal} tone="negative" className="text-2xl font-semibold" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Annualized</p>
            <Money amount={annualTotal} tone="negative" className="text-2xl font-semibold" />
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
            <CardContent>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active subscriptions detected yet.</p>
              ) : (
                active.map(renderRow)
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="inactive">
          <Card>
            <CardContent>
              {inactive.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here.</p>
              ) : (
                inactive.map(renderRow)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SubscriptionCalendar events={calendarEvents} todayIso={todayIso} currency="USD" />
    </div>
  );
}
