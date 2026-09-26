"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, ExternalLink, Pencil, Repeat, Search, Sparkles, Trash2, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { accountLabel, type AccountOption } from "@/components/filter-bar";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { InstallmentsCard } from "@/components/installments-card";
import { AddManualSubscriptionButton, ManualSubscriptionDialog, type ManualSubscription } from "@/components/manual-subscription-form";
import { SubscriptionCalendar, type CalendarEvent } from "@/components/subscription-calendar";
import { SubscriptionInsightsCard } from "@/components/subscription-insights-card";
import { TransactionAvatar } from "@/components/transaction-avatar";
import { formatCurrency } from "@/lib/format";
import { humanizeFrequency, monthlyFactorForFrequency } from "@/lib/plaid-categories";
import type { FoundRow } from "@/lib/found-recurring";
import type { ChargedAfterCancel } from "@/lib/subscription-review";
import { SubscriptionReviewCard, type SubscriptionReview } from "@/components/subscription-review";
import { costShares, dueLabel, monthOutlook, nextCharges, type RecurringCharge } from "@/lib/recurring-board";
import { cancelSearchUrl, effectiveNextDate, isNewSubscription, trialStart, type Insight } from "@/lib/subscription-insights";
import { chargeChange, hasLapsed, hasPriceIncrease, projectNextOccurrence, type ChargeChange, type DatedAmount } from "@/lib/subscriptions-aggregation";
import type { InstallmentPlan } from "@/lib/installments";
import { streamDisplayName } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

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
  // Its latest charge and the one before, when its transactions are known.
  lastCharge: DatedAmount | null;
  previousCharge: DatedAmount | null;
  is_active: boolean;
  user_marked_cancelled: boolean;
  pfc_primary: string | null;
  pfc_detailed: string | null;
  account: { id: string; name: string; mask: string | null } | null;
  // The bank the account is at, for its mark.
  institution: string | null;
  // The merchant's logo from its latest charge, when the bank sent one.
  logoUrl: string | null;
};

/** A bank-found stream, one found in your charges, or one you added, in one shape for the list and panel. */
type Item = {
  key: string;
  source: "plaid" | "manual" | "found";
  name: string;
  amount: number;
  frequency: string | null;
  // Counts toward the totals: the bank still sees it and you haven't cancelled it.
  active: boolean;
  lastDate: string | null;
  lastAmount: number | null;
  // The next charge as stored, and as shown (rolled forward past today).
  storedNext: string | null;
  next: string | null;
  firstDate: string | null;
  accountId: string | null;
  account: string;
  institution: string | null;
  logoUrl: string | null;
  pfcPrimary: string | null;
  pfcDetailed: string | null;
  notes: string | null;
  // Up only, from the average, when the charge before the last isn't known.
  priceIncrease: boolean;
  // The latest charge against the one before it, up or down.
  change: ChargeChange | null;
  lapsed: boolean;
  isNew: boolean;
  trial: { firstAmount: number } | null;
  // The day you cancelled it, when you said.
  cancelledOn: string | null;
  // A charge from it after that day (or from one you'd added that it stands for).
  afterCancel: ChargedAfterCancel | null;
  // It stands for one you'd added too.
  coversYours: boolean;
  stream?: StreamRow;
  manual?: ManualSubscription;
  found?: FoundRow;
};

const MONEY = "font-mono tabular-nums";

type Reconciled = { cancellations: Record<string, string>; covers: Record<string, string[]>; afterCancel: ChargedAfterCancel[] };

function toItems(streams: StreamRow[], manual: ManualSubscription[], found: FoundRow[], todayIso: string, r: Reconciled): Item[] {
  const status = (key: string) => {
    const mine = [key, ...(r.covers[key] ?? [])];
    return {
      cancelledOn: r.cancellations[key] ?? null,
      afterCancel: r.afterCancel.find((a) => mine.includes(a.key)) ?? null,
      coversYours: (r.covers[key] ?? []).length > 0,
    };
  };
  const fromBank = streams.map<Item>((s) => {
    const active = s.is_active && !s.user_marked_cancelled;
    const storedNext = effectiveNextDate(s.predicted_next_date, s.last_date, s.frequency);
    const change = active ? chargeChange(s.previousCharge, s.lastCharge) : null;
    return {
      key: `plaid-${s.id}`,
      source: "plaid",
      name: streamDisplayName(s),
      amount: s.average_amount ?? 0,
      frequency: s.frequency,
      active,
      lastDate: s.last_date,
      lastAmount: s.last_amount,
      storedNext,
      next: projectNextOccurrence(storedNext, s.frequency),
      firstDate: s.first_date,
      accountId: s.account?.id ?? null,
      account: s.account ? accountLabel(s.account) : "Unknown account",
      institution: s.institution,
      logoUrl: s.logoUrl,
      pfcPrimary: s.pfc_primary,
      pfcDetailed: s.pfc_detailed,
      notes: null,
      priceIncrease: active && !s.previousCharge && hasPriceIncrease(s.average_amount, s.last_amount),
      change,
      lapsed: active && hasLapsed(storedNext),
      isNew: s.is_active && isNewSubscription(s.first_date, todayIso),
      trial: trialStart(s.firstChargeAmount, s.average_amount),
      ...status(`plaid-${s.id}`),
      stream: s,
    };
  });
  const added = manual.map<Item>((m) => ({
    key: `manual-${m.id}`,
    source: "manual",
    name: m.name,
    amount: m.amount,
    frequency: m.frequency,
    active: m.is_active,
    lastDate: null,
    lastAmount: null,
    storedNext: m.next_billing_date,
    next: projectNextOccurrence(m.next_billing_date, m.frequency),
    firstDate: null,
    accountId: m.foundOn?.id ?? null,
    account: m.foundOn?.name ?? "Added by you",
    institution: m.foundOn?.name ?? null,
    logoUrl: null,
    pfcPrimary: null,
    pfcDetailed: null,
    notes: m.notes,
    priceIncrease: false,
    change: null,
    lapsed: m.is_active && hasLapsed(m.next_billing_date),
    isNew: false,
    trial: null,
    ...status(`manual-${m.id}`),
    manual: m,
  }));
  const fromCharges = found.map<Item>((f) => {
    const [last, previous] = f.charges;
    return {
      key: `found-${f.key}`,
      source: "found",
      name: f.name,
      amount: f.amount,
      frequency: f.frequency,
      active: f.active,
      lastDate: f.lastDate,
      lastAmount: last?.amount ?? null,
      storedNext: f.nextDate,
      next: f.active ? projectNextOccurrence(f.nextDate, f.frequency) : null,
      firstDate: f.firstDate,
      accountId: f.accountId,
      account: f.accountName ?? "Unknown account",
      institution: f.institution,
      logoUrl: null,
      pfcPrimary: null,
      pfcDetailed: null,
      notes: null,
      priceIncrease: false,
      change: f.active && previous ? chargeChange(previous, last) : null,
      lapsed: f.active && hasLapsed(f.nextDate),
      isNew: f.active && isNewSubscription(f.firstDate, todayIso),
      trial: null,
      ...status(`found-${f.key}`),
      found: f,
    };
  });
  return [...fromBank, ...added, ...fromCharges];
}

function charge(item: Item): RecurringCharge {
  return { key: item.key, name: item.name, amount: item.amount, frequency: item.frequency, lastDate: item.lastDate, nextDate: item.storedNext };
}

const monthly = (item: Item) => item.amount * monthlyFactorForFrequency(item.frequency);

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function Avatar({ item, className }: { item: Item; className?: string }) {
  // One you added has no bank category to pick an icon from.
  if (item.source === "manual") {
    return (
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne/15 text-champagne", className)}>
        <Repeat className="size-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <TransactionAvatar
      transaction={{ name: item.name, merchant_name: item.name, amount: 1, pfc_primary: item.pfcPrimary, pfc_detailed: item.pfcDetailed, logo_url: item.logoUrl }}
      className={cn("size-8", className)}
    />
  );
}

function AccountMark({ item }: { item: Item }) {
  if (item.source === "manual" && !item.institution) return <InstitutionAvatar icon="wallet" size="sm" />;
  return <InstitutionAvatar institution={item.institution ?? item.account} size="sm" />;
}

/** "↑ $2.00": the latest charge against the one before, red when it went up. */
function ChangeNote({ change }: { change: ChargeChange }) {
  const up = change.diff > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(MONEY, "inline-flex items-center gap-0.5 text-[11px]", up ? "text-oxblood-text" : "text-moss")}
      title={`${formatCurrency(change.to.amount, "USD")} on ${shortDate(change.to.date)}, ${up ? "up" : "down"} from ${formatCurrency(change.from.amount, "USD")} on ${shortDate(change.from.date)}`}
    >
      <Arrow className="size-3" aria-hidden />
      <span className="sr-only">{up ? "Up" : "Down"} </span>
      {formatCurrency(Math.abs(change.diff), "USD")}
    </span>
  );
}

function Flags({ item }: { item: Item }) {
  return (
    <>
      {item.priceIncrease && (
        <Badge variant="secondary" className="gap-1 border-oxblood/40 bg-oxblood/10 text-oxblood-text">
          <TrendingUp className="size-3" />
          Price up
        </Badge>
      )}
      {item.lapsed && (
        <Badge variant="secondary" className="gap-1 border-oxblood/40 bg-oxblood/10 text-oxblood-text">
          <AlertTriangle className="size-3" />
          Hasn&apos;t charged
        </Badge>
      )}
      {item.afterCancel && (
        <Badge variant="secondary" className="gap-1 border-oxblood/40 bg-oxblood/10 text-oxblood-text">
          <AlertTriangle className="size-3" />
          Charged again
        </Badge>
      )}
      {item.isNew && (
        <Badge variant="secondary" className="gap-1 border-champagne/30 bg-champagne/10 text-champagne">
          <Sparkles className="size-3" />
          New
        </Badge>
      )}
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col items-center gap-1 py-2 text-center">
        <span className={cn(MONEY, "text-xl font-semibold text-bone")}>{value}</span>
        <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </CardContent>
    </Card>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 whitespace-nowrap transition-colors",
            value === o.value ? "bg-bone/12 text-bone ring-1 ring-bone/10 ring-inset hover:bg-bone/16" : "text-muted-foreground hover:bg-bone/6 hover:text-bone"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Name · account · next charge · amount · chevron.
const GRID = "grid grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_6.5rem_1rem]";

function Row({ item, todayIso, onOpen }: { item: Item; todayIso: string; onOpen: (key: string) => void }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => onOpen(item.key)}
        aria-label={`${item.name}, ${formatCurrency(item.amount, "USD")} ${humanizeFrequency(item.frequency).toLowerCase()}`}
        className={cn(GRID, "w-full px-3 py-2.5 text-left transition-colors hover:bg-bone/4 sm:px-4", !item.active && "opacity-70")}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Avatar item={item} />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-bone">{item.name}</span>
              <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <Flags item={item} />
              </span>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {humanizeFrequency(item.frequency)}
              {/* The account and date columns fold into this line on a phone. */}
              <span className="md:hidden">
                {item.active && item.next ? ` · ${shortDate(item.next)}` : ""} · {item.account}
              </span>
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground md:flex">
          <AccountMark item={item} />
          <span className="truncate">{item.account}</span>
        </span>
        <span className="hidden min-w-0 flex-col md:flex">
          {!item.active ? (
            <span className="text-sm text-muted-foreground">Cancelled</span>
          ) : item.next ? (
            <>
              <span className="text-sm text-bone">{shortDate(item.next)}</span>
              <span className={cn("text-xs", item.lapsed ? "text-oxblood-text" : "text-muted-foreground")}>
                {item.lapsed ? "Overdue" : dueLabel(item.next, todayIso)}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </span>
        <span className="flex flex-col items-end">
          <span className={cn(MONEY, "text-right text-sm text-bone")}>{formatCurrency(item.amount, "USD")}</span>
          {item.change && <ChangeNote change={item.change} />}
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/** Everything about one subscription, and cancelling, editing or removing it. */
function Panel({ item, todayIso, onClose }: { item: Item; todayIso: string; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const perMonth = monthly(item);

  async function send(url: string, init: RequestInit, done: string) {
    setSaving(true);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't update the subscription");
      }
      toast.success(done);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the subscription");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const cancelled = item.source === "plaid" ? Boolean(item.stream?.user_marked_cancelled) : item.found ? Boolean(item.found.cancelledOn) : !item.active;
  const [cancelOn, setCancelOn] = useState<string | null>(null);
  // Cancelled on a day: anything it charges after that is flagged. Undoing puts it back in your totals.
  function setCancelled(on: string | null) {
    const body = on ? { action: "cancel", key: item.key, on } : { action: "uncancel", key: item.key };
    void send("/api/subscriptions/review", { method: "PATCH", body: JSON.stringify(body) }, on ? `Cancelled as of ${shortDate(on)}` : "Marked as active again").then(
      (ok) => ok && setCancelOn(null)
    );
  }

  async function dismiss() {
    if (!item.found) return;
    const body = JSON.stringify({ key: item.found.key, action: "dismiss" });
    if (await send("/api/found-recurring", { method: "PATCH", body }, `${item.name} won't be listed`)) onClose();
  }

  async function remove() {
    if (!item.manual) return;
    if (await send(`/api/manual-subscriptions/${item.manual.id}`, { method: "DELETE" }, "Subscription removed")) onClose();
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <Avatar item={item} className="size-10" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="truncate">{item.name}</SheetTitle>
            <SheetDescription>
              {humanizeFrequency(item.frequency)} · {item.account}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn(MONEY, "text-2xl font-semibold text-bone")}>{formatCurrency(item.amount, "USD")}</span>
          <Flags item={item} />
          {!item.active && <Badge variant="secondary">{cancelled ? "Cancelled" : "Stopped"}</Badge>}
        </div>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5">
        <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border text-center">
          <div className="flex flex-col gap-0.5 px-2 py-2.5">
            <span className={cn(MONEY, "text-sm text-bone")}>{formatCurrency(perMonth, "USD")}</span>
            <span className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">A month</span>
          </div>
          <div className="flex flex-col gap-0.5 px-2 py-2.5">
            <span className={cn(MONEY, "text-sm text-bone")}>{formatCurrency(perMonth * 12, "USD")}</span>
            <span className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">A year</span>
          </div>
          <div className="flex flex-col gap-0.5 px-2 py-2.5">
            <span className="text-sm text-bone">{item.active && item.next ? shortDate(item.next) : "—"}</span>
            <span className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {item.active && item.next ? dueLabel(item.next, todayIso) : "Next"}
            </span>
          </div>
        </div>

        {item.change && item.change.diff < 0 && (
          <p className="rounded-lg border border-moss/30 bg-moss/8 px-3 py-2.5 text-xs text-bone/90">
            The last charge went down <span className={MONEY}>{formatCurrency(-item.change.diff, "USD")}</span> (
            {Math.round(-item.change.share * 100)}%): <span className={MONEY}>{formatCurrency(item.change.to.amount, "USD")}</span> on{" "}
            {shortDate(item.change.to.date)}, after <span className={MONEY}>{formatCurrency(item.change.from.amount, "USD")}</span> on{" "}
            {shortDate(item.change.from.date)}.
          </p>
        )}
        {item.afterCancel && (
          <p className="rounded-lg border border-oxblood/30 bg-oxblood/8 px-3 py-2.5 text-xs text-bone/90">
            It charged <span className={MONEY}>{formatCurrency(item.afterCancel.charge.amount, "USD")}</span> on {shortDate(item.afterCancel.charge.date)}
            {item.afterCancel.charge.accountName ? ` to ${item.afterCancel.charge.accountName}` : ""}, after you cancelled it on{" "}
            {shortDate(item.afterCancel.cancelledOn)}. Answer it in Subscriptions to review, at the top of the page.
          </p>
        )}
        {((item.change && item.change.diff > 0) || item.priceIncrease || item.lapsed || item.trial) && (
          <div className="flex flex-col gap-2 rounded-lg border border-oxblood/30 bg-oxblood/8 px-3 py-2.5 text-xs text-bone/90">
            {item.change && item.change.diff > 0 && (
              <p>
                The last charge went up <span className={MONEY}>{formatCurrency(item.change.diff, "USD")}</span> (
                {Math.round(item.change.share * 100)}%): <span className={MONEY}>{formatCurrency(item.change.to.amount, "USD")}</span> on{" "}
                {shortDate(item.change.to.date)}, after <span className={MONEY}>{formatCurrency(item.change.from.amount, "USD")}</span> on{" "}
                {shortDate(item.change.from.date)}.
              </p>
            )}
            {item.priceIncrease && item.lastAmount !== null && (
              <p>
                The last charge was <span className={MONEY}>{formatCurrency(item.lastAmount, "USD")}</span>, above its usual{" "}
                <span className={MONEY}>{formatCurrency(item.amount, "USD")}</span>. Worth checking whether the price went up.
              </p>
            )}
            {item.lapsed && <p>It was due {item.storedNext ? shortDate(item.storedNext) : "a while ago"} and hasn&apos;t charged since. It may have stopped.</p>}
            {item.trial && (
              <p>
                It started with a <span className={MONEY}>{formatCurrency(item.trial.firstAmount, "USD")}</span> charge, likely a trial that turned into
                the full price.
              </p>
            )}
          </div>
        )}

        <dl className="flex flex-col divide-y divide-border rounded-lg border border-border px-3 text-sm">
          <Detail label="Charges">{humanizeFrequency(item.frequency)}</Detail>
          <Detail label="Next charge">{item.active && item.next ? longDate(item.next) : "—"}</Detail>
          {item.lastDate && (
            <Detail label="Last charge">
              {longDate(item.lastDate)}
              {item.lastAmount !== null && <span className={cn(MONEY, "text-muted-foreground")}> · {formatCurrency(item.lastAmount, "USD")}</span>}
            </Detail>
          )}
          {item.firstDate && <Detail label="First seen">{longDate(item.firstDate)}</Detail>}
          <Detail label="Account">
            <span className="inline-flex max-w-full items-center justify-end gap-2">
              <AccountMark item={item} />
              <span className="truncate">{item.account}</span>
            </span>
          </Detail>
          <Detail label="Source">
            {item.source === "plaid"
              ? `Found by your bank${item.coversYours ? " (the one you added is folded into it)" : ""}`
              : item.found
                ? `Found in your charges${item.found.restarted ? `, started again ${shortDate(item.found.firstDate)}` : ""}${item.coversYours ? " (the one you added is folded into it)" : ""}`
                : item.manual?.foundOn
                  ? `Added by you, charged to ${item.manual.foundOn.name}`
                  : "Added by you"}
          </Detail>
          {item.notes && <Detail label="Notes">{item.notes}</Detail>}
        </dl>

        {item.found && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Recent charges</p>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border px-3 text-sm">
              {item.found.charges.slice(0, 6).map((c, i) => (
                <li key={c.id ?? `${c.date}-${i}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-bone">{longDate(c.date)}</span>
                    {c.accountName && <span className="truncate text-xs text-muted-foreground">{c.accountName}</span>}
                  </span>
                  <span className={cn(MONEY, "shrink-0 text-bone")}>{formatCurrency(c.amount, "USD")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(item.active || cancelled) && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Manage</p>
            {cancelled ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
                <span className="flex flex-col">
                  <span className="text-sm text-bone">{item.cancelledOn ? `Cancelled on ${longDate(item.cancelledOn)}` : "Marked as cancelled"}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.cancelledOn ? "Out of your totals. Any charge from it after that day is flagged." : "Out of your totals."}
                  </span>
                </span>
                <Button size="sm" variant="outline" disabled={saving} onClick={() => setCancelled(null)}>
                  Still subscribed
                </Button>
              </div>
            ) : cancelOn === null ? (
              <Button size="sm" variant="outline" className="self-start" disabled={saving} onClick={() => setCancelOn(todayIso)}>
                I cancelled it
              </Button>
            ) : (
              <form
                className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (/^\d{4}-\d{2}-\d{2}$/.test(cancelOn)) setCancelled(cancelOn);
                }}
              >
                <label htmlFor="cancelled-on" className="text-sm text-bone">
                  The day you cancelled it
                </label>
                <Input id="cancelled-on" type="date" value={cancelOn} max={todayIso} onChange={(e) => setCancelOn(e.target.value)} required />
                <span className="text-xs text-muted-foreground">It leaves your totals now, and any charge from it after this day is flagged, even one.</span>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={saving}>
                    Mark as cancelled
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setCancelOn(null)}>
                    Never mind
                  </Button>
                </div>
              </form>
            )}
            <div className="flex flex-wrap gap-2">
              {item.active && (
                <Button asChild size="sm" variant="outline">
                  <a href={cancelSearchUrl(item.name)} target="_blank" rel="noopener noreferrer">
                    How to cancel
                    <ExternalLink className="size-3.5" aria-hidden />
                    <span className="sr-only"> {item.name} (opens a web search in a new tab)</span>
                  </a>
                </Button>
              )}
              {item.found && (
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={saving} onClick={dismiss}>
                  Not a subscription
                </Button>
              )}
              {item.manual && (
                <>
                  <ManualSubscriptionDialog
                    subscription={item.manual}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                    }
                  />
                  <Button size="sm" variant="ghost" className="text-oxblood-text hover:text-oxblood-text" disabled={saving} onClick={remove}>
                    <Trash2 className="size-3.5" />
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </SheetBody>
    </>
  );
}

/** This month's charges so far against what's still to come, and the next few charges. */
function ComingUp({ items, todayIso, onOpen }: { items: Item[]; todayIso: string; onOpen: (key: string) => void }) {
  const charges = items.map(charge);
  const month = monthOutlook(charges, todayIso);
  const total = month.paidTotal + month.upcomingTotal;
  const soon = nextCharges(charges, todayIso).slice(0, 6);
  const monthName = new Date(`${todayIso}T00:00:00`).toLocaleDateString("en-US", { month: "long" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coming up</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{monthName} so far</span>
            <span className="text-muted-foreground">
              <span className={cn(MONEY, "font-semibold text-bone")}>{formatCurrency(month.paidTotal, "USD")}</span> of{" "}
              <span className={MONEY}>{formatCurrency(total, "USD")}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bone/8">
            <div className="h-full rounded-full bg-champagne" style={{ width: `${total > 0 ? (month.paidTotal / total) * 100 : 0}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {month.upcoming.length === 0 ? (
              <>Nothing else is due this month.</>
            ) : (
              <>
                <span className={cn(MONEY, "text-bone")}>{formatCurrency(month.upcomingTotal, "USD")}</span> still to charge across{" "}
                {month.upcoming.length} {month.upcoming.length === 1 ? "subscription" : "charges"}.
              </>
            )}
          </p>
        </div>

        {soon.length > 0 && (
          <ul className="-mx-2 flex flex-col">
            {soon.map((c) => (
              <li key={`${c.key}-${c.date}`}>
                <button
                  type="button"
                  onClick={() => onOpen(c.key)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-bone/6"
                >
                  <span className="flex w-10 shrink-0 flex-col items-center rounded-md border border-border py-0.5 leading-tight">
                    <span className="text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                      {new Date(`${c.date}T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
                    </span>
                    <span className="text-sm text-bone tabular-nums">{Number(c.date.slice(8))}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-bone">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{dueLabel(c.date, todayIso)}</span>
                  </span>
                  <span className={cn(MONEY, "text-sm")}>{formatCurrency(c.amount, "USD")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const SHARE_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)"];

/** Which subscriptions make up the monthly cost. */
function WhereItGoes({ items, onOpen }: { items: Item[]; onOpen: (key: string) => void }) {
  const shares = costShares(items.map(charge), 5);
  const [focus, setFocus] = useState<string | null>(null);
  if (shares.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where it goes</CardTitle>
        <p className="text-xs text-muted-foreground">Each one&apos;s share of the monthly cost</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" onMouseLeave={() => setFocus(null)}>
          {shares.map((s, i) => (
            <span
              key={s.key}
              onMouseEnter={() => setFocus(s.key)}
              className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${s.share * 100}%`,
                backgroundColor: s.key === "rest" ? "var(--ash-grey)" : SHARE_COLORS[i % SHARE_COLORS.length],
                opacity: focus && focus !== s.key ? 0.3 : 1,
              }}
            />
          ))}
        </div>
        <ul className="-mx-2 flex flex-col" onMouseLeave={() => setFocus(null)}>
          {shares.map((s, i) => {
            const body = (
              <>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.key === "rest" ? "var(--ash-grey)" : SHARE_COLORS[i % SHARE_COLORS.length] }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-bone">{s.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{Math.round(s.share * 100)}%</span>
                <span className={cn(MONEY, "w-20 text-right text-sm")}>{formatCurrency(s.monthly, "USD")}</span>
              </>
            );
            const cls = cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors", focus === s.key && "bg-bone/6");
            return (
              <li key={s.key} onMouseEnter={() => setFocus(s.key)}>
                {s.key === "rest" ? (
                  <div className={cls}>{body}</div>
                ) : (
                  <button type="button" onClick={() => onOpen(s.key)} className={cn(cls, "hover:bg-bone/6")}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** How often it charges, as the list filters it: monthly, yearly, or anything else (weekly, twice a month). */
type Often = "all" | "monthly" | "yearly" | "other";
const oftenOf = (item: Item): Exclude<Often, "all"> => (item.frequency === "MONTHLY" ? "monthly" : item.frequency === "ANNUALLY" ? "yearly" : "other");

/**
 * Monthly and yearly subscriptions apart: how many, and what they cost in
 * their own terms (a month for the monthly ones, a year for the yearly
 * ones). Each row filters the list.
 */
function ByHowOften({ items, value, onChange }: { items: Item[]; value: Often; onChange: (v: Often) => void }) {
  const group = (o: Exclude<Often, "all">) => items.filter((i) => oftenOf(i) === o);
  const monthlyOnes = group("monthly");
  const yearlyOnes = group("yearly");
  const otherOnes = group("other");
  const perMonth = items.reduce((s, i) => s + monthly(i), 0);
  const yearTotal = yearlyOnes.reduce((s, i) => s + i.amount, 0);
  const rows: { value: Exclude<Often, "all">; label: string; count: number; amount: number; per: string; note?: string }[] = [
    { value: "monthly", label: "Monthly", count: monthlyOnes.length, amount: monthlyOnes.reduce((s, i) => s + i.amount, 0), per: "a month" },
    { value: "yearly", label: "Yearly", count: yearlyOnes.length, amount: yearTotal, per: "a year", note: yearTotal > 0 ? `about ${formatCurrency(yearTotal / 12, "USD")} a month` : undefined },
    ...(otherOnes.length > 0
      ? [{ value: "other" as const, label: "Weekly and other", count: otherOnes.length, amount: otherOnes.reduce((s, i) => s + monthly(i), 0), per: "a month" }]
      : []),
  ];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>By how often</CardTitle>
        <p className="text-xs text-muted-foreground">Pick one to see only those</p>
      </CardHeader>
      <CardContent className="flex flex-col">
        <ul className="-mx-2 flex flex-col">
          {rows.map((r) => {
            const on = value === r.value;
            return (
              <li key={r.value}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? "all" : r.value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-bone/6",
                    on && "bg-bone/[0.08] ring-1 ring-bone/10 ring-inset"
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm text-bone">{r.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.count} {r.count === 1 ? "subscription" : "subscriptions"}
                      {r.note ? ` · ${r.note}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className={cn(MONEY, "text-sm text-bone")}>{formatCurrency(r.amount, "USD")}</span>
                    <span className="text-[11px] text-muted-foreground">{r.per}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">All together</span>
          <span className="flex flex-col items-end">
            <span className={cn(MONEY, "text-sm font-semibold text-bone")}>{formatCurrency(perMonth, "USD")}</span>
            <span className="text-[11px] text-muted-foreground">
              a month · <span className={MONEY}>{formatCurrency(perMonth * 12, "USD")}</span> a year
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

type Status = "active" | "cancelled";
type Sort = "next" | "amount" | "name";

export function RecurringBoard({
  streams,
  found,
  manualSubscriptions,
  covers,
  cancellations,
  review,
  accounts,
  insights,
  calendarEvents,
  installments,
  todayIso,
}: {
  streams: StreamRow[];
  found: FoundRow[];
  manualSubscriptions: ManualSubscription[];
  covers: Record<string, string[]>;
  cancellations: Record<string, string>;
  review: SubscriptionReview;
  accounts: AccountOption[];
  insights: Insight[];
  calendarEvents: CalendarEvent[];
  installments: InstallmentPlan[];
  todayIso: string;
}) {
  const [status, setStatus] = useState<Status>("active");
  const [sort, setSort] = useState<Sort>("next");
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [often, setOften] = useState<Often>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState(0);

  const all = useMemo(
    () => toItems(streams, manualSubscriptions, found, todayIso, { cancellations, covers, afterCancel: review.afterCancel }),
    [streams, manualSubscriptions, found, todayIso, cancellations, covers, review.afterCancel]
  );
  const active = all.filter((i) => i.active);
  const perMonth = active.reduce((s, i) => s + monthly(i), 0);
  const outlook = monthOutlook(active.map(charge), todayIso);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all.filter(
      (i) =>
        (status === "active" ? i.active : !i.active) &&
        (often === "all" || oftenOf(i) === often) &&
        (accountFilter === "all" || (accountFilter === "manual" ? i.source === "manual" && i.accountId === null : i.accountId === accountFilter)) &&
        (!q || i.name.toLowerCase().includes(q))
    );
    const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);
    return list.sort((a, b) =>
      sort === "amount"
        ? monthly(b) - monthly(a) || byName(a, b)
        : sort === "name"
          ? byName(a, b)
          : (a.next ?? "9999").localeCompare(b.next ?? "9999") || byName(a, b)
    );
  }, [all, status, sort, search, accountFilter, often]);
  const shownMonthly = shown.reduce((s, i) => s + monthly(i), 0);
  // Yearly ones add up by the year; everything else by the month.
  const byYear = often === "yearly";
  const shownYearly = shown.reduce((s, i) => s + i.amount, 0);
  const inStatus = all.filter((i) => (status === "active" ? i.active : !i.active));
  const countOf = (o: Exclude<Often, "all">) => inStatus.filter((i) => oftenOf(i) === o).length;

  const cancelledCount = all.length - active.length;
  const open = (key: string) => {
    // An installment payment on the calendar goes to its plan above.
    if (key.startsWith("installment:")) {
      document.getElementById("installments")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setOpenCount((n) => n + 1);
    setOpenKey(key);
  };
  const openItem = openKey ? (all.find((i) => i.key === openKey) ?? null) : null;
  // Accounts something is charged to: the bank's, and imported cards subscriptions you added are on.
  const usedAccounts = [
    ...accounts.filter(
      (a) => streams.some((s) => s.account?.id === a.id) || found.some((f) => f.accountId === a.id) || manualSubscriptions.some((m) => m.foundOn?.id === a.id)
    ),
    ...Array.from(
      new Map(
        [
          ...manualSubscriptions.flatMap((m) => (m.foundOn && !accounts.some((a) => a.id === m.foundOn!.id) ? [{ id: m.foundOn.id, name: m.foundOn.name }] : [])),
          ...found.flatMap((f) => (f.accountId && !accounts.some((a) => a.id === f.accountId) ? [{ id: f.accountId, name: f.accountName ?? "Account" }] : [])),
        ].map((a) => [a.id, { ...a, mask: null }] as const)
      ).values()
    ),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Room at the right for the alerts bell. */}
      <div className="flex flex-wrap items-center justify-between gap-3 md:pr-12">
        <div className="flex items-baseline gap-4">
          <h1 className="font-serif text-2xl font-semibold text-bone">Recurring</h1>
          <span className="text-base text-muted-foreground">
            {active.length} active · {formatCurrency(perMonth, "USD")} a month
          </span>
        </div>
        <AddManualSubscriptionButton />
      </div>

      <SubscriptionReviewCard review={review} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Per month" value={formatCurrency(perMonth, "USD")} />
        <Stat label="Per year" value={formatCurrency(perMonth * 12, "USD")} />
        <Stat label="Charged this month" value={formatCurrency(outlook.paidTotal, "USD")} />
        <Stat label="Still to come" value={formatCurrency(outlook.upcomingTotal, "USD")} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <div id="installments" className="scroll-mt-6">
            <InstallmentsCard plans={installments} todayIso={todayIso} />
          </div>

          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
              <Segmented
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: `Active (${active.length})` },
                  { value: "cancelled", label: `Cancelled (${cancelledCount})` },
                ]}
              />
              <Segmented
                label="How often"
                value={often}
                onChange={setOften}
                options={[
                  { value: "all", label: "All" },
                  { value: "monthly", label: `Monthly (${countOf("monthly")})` },
                  { value: "yearly", label: `Yearly (${countOf("yearly")})` },
                  ...(countOf("other") > 0 || often === "other" ? [{ value: "other" as const, label: `Other (${countOf("other")})` }] : []),
                ]}
              />
              <Segmented
                label="Sort by"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "next", label: "Due date" },
                  { value: "amount", label: "Cost" },
                  { value: "name", label: "Name" },
                ]}
              />
              <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
                <div className="relative flex-1 sm:w-44 sm:flex-none">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search subscriptions" className="h-8 pl-8 text-sm" />
                </div>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="w-36" aria-label="Account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {usedAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {accountLabel(a)}
                      </SelectItem>
                    ))}
                    {manualSubscriptions.some((m) => !m.foundOn) && <SelectItem value="manual">Added by you</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={cn(GRID, "border-y border-border bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase sm:px-4")}>
              <span>Name</span>
              <span className="hidden md:block">Account</span>
              <span className="hidden md:block">{status === "active" ? "Next charge" : "Status"}</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {shown.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {search || accountFilter !== "all" || often !== "all"
                  ? "Nothing matches these filters."
                  : status === "active"
                    ? "No active subscriptions yet. Add one, or they'll show up as your bank spots them."
                    : "Nothing cancelled."}
              </p>
            ) : (
              <ul>
                {shown.map((item) => (
                  <Row key={item.key} item={item} todayIso={todayIso} onOpen={open} />
                ))}
              </ul>
            )}
            {status === "active" && shown.length > 0 && (
              <div className={cn(GRID, "border-t border-border bg-muted/40 px-3 py-2.5 sm:px-4")}>
                <span className="text-sm font-semibold text-bone">{byYear ? "Total a year" : "Total a month"}</span>
                <span className="hidden md:block" />
                <span className="hidden text-xs text-muted-foreground md:block">
                  {byYear ? `about ${formatCurrency(shownYearly / 12, "USD")} a month` : `${formatCurrency(shownMonthly * 12, "USD")} a year`}
                </span>
                <span className={cn(MONEY, "text-right text-sm font-semibold text-bone")}>{formatCurrency(byYear ? shownYearly : shownMonthly, "USD")}</span>
                <span />
              </div>
            )}
          </Card>

          <SubscriptionCalendar events={calendarEvents} todayIso={todayIso} currency="USD" onOpen={open} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ByHowOften
            items={active}
            value={often}
            onChange={(v) => {
              setOften(v);
              setStatus("active");
            }}
          />
          <ComingUp items={active} todayIso={todayIso} onOpen={open} />
          <WhereItGoes items={active} onOpen={open} />
          <SubscriptionInsightsCard insights={insights} />
          {active.length > 0 && (
            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
              <Wallet className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Totals count each subscription at its usual price, spread to a month by how often it charges.
            </p>
          )}
        </div>
      </div>

      <Sheet open={openItem !== null} onOpenChange={(next) => !next && setOpenKey(null)}>
        <SheetContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
        >
          {openItem && <Panel key={`${openKey}:${openCount}`} item={openItem} todayIso={todayIso} onClose={() => setOpenKey(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
