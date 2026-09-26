"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ExternalLink, Repeat, Sparkles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/segmented";
import type { FoundRow } from "@/lib/found-recurring";
import { formatCurrency } from "@/lib/format";
import { humanizeFrequency } from "@/lib/plaid-categories";
import { cancelSearchUrl } from "@/lib/subscription-insights";
import { monthAfter, type ChargedAfterCancel, type NewSubscription } from "@/lib/subscription-review";
import { cn } from "@/lib/utils";

export type SubscriptionReview = { newSubscriptions: NewSubscription[]; afterCancel: ChargedAfterCancel[]; toConfirm: FoundRow[] };

const usd = (n: number) => formatCurrency(n, "USD");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const SHOWN = 4;

async function send(url: string, body: unknown, method: "POST" | "PATCH" = "PATCH"): Promise<void> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Couldn't save that");
  }
}

type Frequency = "WEEKLY" | "MONTHLY" | "ANNUALLY";

function renewal(fromIso: string, frequency: Frequency): string {
  if (frequency === "MONTHLY") return monthAfter(fromIso);
  if (frequency === "ANNUALLY") return `${Number(fromIso.slice(0, 4)) + 1}${fromIso.slice(4)}`;
  return new Date(Date.parse(`${fromIso}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
}

/** Tracking a subscription from its first charge: what it's called, what it costs, how often, and the day it renews. */
function TrackDialog({ item, onClose, onDone }: { item: NewSubscription; onClose: () => void; onDone: () => void }) {
  const { charge } = item;
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(charge.amount));
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [renewsOn, setRenewsOn] = useState(item.renewsOn);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(amount.replace(/[$,]/g, ""));
    if (!name.trim()) return void toast.error("Give it a name");
    if (!(price > 0)) return void toast.error("Enter what it costs");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(renewsOn)) return void toast.error("Enter the day it renews");
    setSaving(true);
    try {
      await send(
        "/api/manual-subscriptions",
        {
        name: name.trim(),
        amount: price,
        frequency,
        next_billing_date: renewsOn,
        notes: charge.accountName ? `Charged to ${charge.accountName}` : null,
        },
        "POST"
      );
      // This charge is answered, whatever it's called now.
      await send("/api/subscriptions/review", { action: "dismiss-new", name: charge.name, date: charge.date, amount: charge.amount });
      toast.success(`${name.trim()} is tracked. It renews ${day(renewsOn)}.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Track {item.name}</DialogTitle>
          <DialogDescription>
            <span className="font-mono tabular-nums">{usd(charge.amount)}</span> on {day(charge.date)}
            {charge.accountName ? ` to ${charge.accountName}` : ""}
            {charge.pending ? " (pending)" : ""}. It counts in Recurring from now on, and when its charges show it&apos;s regular, the
            bank&apos;s or the found copy takes over from this one on its own.
          </DialogDescription>
        </DialogHeader>
        <form id="track-subscription" className="flex flex-col gap-4" onSubmit={save}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="track-name">Name</Label>
            <Input id="track-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="track-amount">Price</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">$</span>
                <Input id="track-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-6 text-right font-mono tabular-nums" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="track-renews">Renews on</Label>
              <Input id="track-renews" type="date" value={renewsOn} onChange={(e) => setRenewsOn(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">How often</span>
            <Segmented
              label="How often"
              value={frequency}
              onChange={(f) => {
                setFrequency(f);
                setRenewsOn(renewal(charge.date, f));
              }}
              options={[
                { value: "MONTHLY", label: "Monthly" },
                { value: "ANNUALLY", label: "Yearly" },
                { value: "WEEKLY", label: "Weekly" },
              ]}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="track-subscription" disabled={saving}>
            {saving ? "Saving..." : "Track it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  Icon,
  tone,
  title,
  detail,
  pending,
  amount,
  children,
}: {
  Icon: LucideIcon;
  tone: "alert" | "new" | "found";
  title: React.ReactNode;
  detail: string;
  pending?: boolean;
  amount: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-border px-5 py-3 last:border-b-0 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            tone === "alert" ? "bg-oxblood/15 text-oxblood-text" : "bg-champagne/12 text-champagne"
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-bone">{title}</span>
            {pending && <span className="shrink-0 text-[11px] text-champagne">Pending</span>}
          </span>
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        </div>
        <span className="shrink-0 font-mono text-sm text-bone tabular-nums">{usd(amount)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 lg:shrink-0">{children}</div>
    </li>
  );
}

/**
 * What's waiting on you about subscriptions: a charge after one you
 * cancelled, a first charge from a subscription service nothing tracks
 * yet, and ones found in your charges that just started. Nothing shows
 * when nothing's waiting.
 */
export function SubscriptionReviewCard({ review, variant = "page" }: { review: SubscriptionReview; variant?: "overview" | "page" }) {
  const router = useRouter();
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [tracking, setTracking] = useState<NewSubscription | null>(null);
  const [showAll, setShowAll] = useState(false);

  type Entry = { id: string; node: (id: string) => React.ReactNode };
  const entries: Entry[] = [
    ...review.afterCancel.map((a) => ({
      id: `after-${a.charge.id}`,
      node: (id: string) => (
        <Row
          key={id}
          Icon={AlertTriangle}
          tone="alert"
          title={
            <>
              {a.name} <span className="text-oxblood-text">charged after you cancelled</span>
            </>
          }
          detail={[day(a.charge.date), a.charge.accountName, `cancelled ${day(a.cancelledOn)}`].filter(Boolean).join(" · ")}
          pending={a.charge.pending}
          amount={a.charge.amount}
        >
          <Button asChild size="sm" variant="outline">
            <a href={cancelSearchUrl(a.name)} target="_blank" rel="noopener noreferrer">
              How to cancel
              <ExternalLink aria-hidden />
              <span className="sr-only"> (opens a web search in a new tab)</span>
            </a>
          </Button>
          {answer(id, "Still subscribed", () => act(id, { action: "uncancel", key: a.key }, `${a.name} is back in your totals`))}
          {answer(id, "Expected it", () => act(id, { action: "acknowledge", key: a.key, date: a.charge.date, amount: a.charge.amount }, "Noted"), { quiet: true })}
        </Row>
      ),
    })),
    ...review.newSubscriptions.map((n) => ({
      id: `new-${n.charge.id}`,
      node: (id: string) => (
        <Row
          key={id}
          Icon={Sparkles}
          tone="new"
          title={
            <>
              {n.name} <span className="text-muted-foreground">· new subscription?</span>
            </>
          }
          detail={[day(n.charge.date), n.charge.accountName, `would renew ${day(n.renewsOn)}`].filter(Boolean).join(" · ")}
          pending={n.charge.pending}
          amount={n.charge.amount}
        >
          <Button type="button" size="sm" variant="outline" disabled={busy === id} onClick={() => setTracking(n)} className="hover:border-champagne/40 hover:text-champagne">
            <Repeat aria-hidden />
            Track it
          </Button>
          {answer(id, "Not a subscription", () => act(id, { action: "dismiss-new", name: n.charge.name, date: n.charge.date, amount: n.charge.amount }, "Noted"), { quiet: true })}
        </Row>
      ),
    })),
    ...review.toConfirm.map((f) => ({
      id: `found-${f.key}`,
      node: (id: string) => (
        <Row
          key={id}
          Icon={Repeat}
          tone="found"
          title={
            <>
              {f.name} <span className="text-muted-foreground">· found in your charges</span>
            </>
          }
          detail={[`${humanizeFrequency(f.frequency)}${f.amountVaries ? ", about" : ""}`, f.accountName, `renews ${day(f.nextDate)}`].filter(Boolean).join(" · ")}
          amount={f.amount}
        >
          {answer(id, "Looks right", () => act(id, { action: "confirm", key: `found-${f.key}` }, `${f.name} confirmed`), { icon: true })}
          {answer(id, "Not a subscription", () => act(id, { key: f.key, action: "dismiss" }, `${f.name} won't be listed`, "/api/found-recurring"), { quiet: true })}
        </Row>
      ),
    })),
  ];
  const open = entries.filter((e) => !answered.has(e.id));

  async function act(id: string, body: unknown, done: string, url = "/api/subscriptions/review") {
    setBusy(id);
    try {
      await send(url, body);
      setAnswered((s) => new Set(s).add(id));
      toast.success(done);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(null);
    }
  }

  function answer(id: string, label: string, onClick: () => void, { quiet = false, icon = false }: { quiet?: boolean; icon?: boolean } = {}) {
    return (
      <Button
        type="button"
        size="sm"
        variant={quiet ? "ghost" : "outline"}
        disabled={busy === id}
        onClick={onClick}
        className={quiet ? "text-muted-foreground" : "hover:border-champagne/40 hover:text-champagne"}
      >
        {icon && <Check aria-hidden />}
        {label}
      </Button>
    );
  }

  if (open.length === 0) return null;
  const shown = showAll ? open : open.slice(0, SHOWN);

  return (
    <>
      <section aria-label="Subscriptions to review" className="rounded-xl border border-champagne/25 bg-card">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne/12 text-champagne">
            <Repeat className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-bone">
              Subscriptions to review
              <span className="rounded-full bg-champagne/15 px-1.5 py-px font-mono text-[11px] text-champagne tabular-nums">{open.length}</span>
            </h2>
            <p className="text-xs text-muted-foreground">New ones the day they first charge, and anything charging after you cancelled it.</p>
          </div>
          {variant === "overview" && (
            <Link href="/recurring" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne">
              Recurring <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
        <ul aria-label="To review" className="border-t border-border">
          {shown.map((e) => e.node(e.id))}
        </ul>
        {open.length > SHOWN && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-border px-5 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-champagne">
            {showAll ? "Show fewer" : `Show all ${open.length}`}
          </button>
        )}
      </section>
      {tracking && (
        <TrackDialog
          item={tracking}
          onClose={() => setTracking(null)}
          onDone={() => {
            setAnswered((s) => new Set(s).add(`new-${tracking.charge.id}`));
            setTracking(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
