"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { CardArt } from "@/components/card-art";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CardRewards } from "@/lib/card-rewards";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const pts = (n: number) => Math.round(n).toLocaleString("en-US");
const fmt = (unit: "points" | "cash", n: number) => (unit === "points" ? `${pts(n)} pts` : formatCurrency(n, "USD"));
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Type in the points the issuer's app shows; the site can't read them from the bank. */
function BalanceDialog({ card, trigger }: { card: CardRewards; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState("");
  const [pending, setPending] = useState("");
  const [saving, setSaving] = useState(false);

  const cash = card.unit === "cash";

  async function save() {
    const a = Number(available.replace(/[$,]/g, ""));
    const p = pending.trim() === "" ? 0 : Number(pending.replace(/,/g, ""));
    if (!Number.isFinite(a) || a < 0 || !Number.isFinite(p) || p < 0) {
      toast.error(cash ? "Enter this year's Daily Cash as a number" : "Enter the available and pending points as numbers");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${card.accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewards_balance: { available: a, pending: p } }),
      });
      if (!res.ok) throw new Error();
      toast.success(cash ? `${card.name}'s Daily Cash is updated` : `${card.name}'s points are updated`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(cash ? "Couldn't save the Daily Cash" : "Couldn't save the points");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setAvailable(card.balance ? String(card.balance.available) : "");
          setPending(card.balance ? String(card.balance.pending) : "");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{cash ? `${card.name} Daily Cash` : `${card.name} points`}</DialogTitle>
          <DialogDescription>
            {cash
              ? "Statements don't show every bit of Daily Cash (promotions, partner merchants), so copy this year's total from Wallet: Apple Card → Daily Cash."
              : "Banks don't share points balances, so copy them from the Chase app (Ultimate Rewards)."}{" "}
            Purchases after today are added as estimates until you update it again.
          </DialogDescription>
        </DialogHeader>
        {cash ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`avail-${card.accountId}`}>Daily Cash this year</Label>
            <Input id={`avail-${card.accountId}`} inputMode="decimal" value={available} onChange={(e) => setAvailable(e.target.value)} placeholder="155.28" />
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`avail-${card.accountId}`}>Available</Label>
            <Input id={`avail-${card.accountId}`} inputMode="numeric" value={available} onChange={(e) => setAvailable(e.target.value)} placeholder="125,045" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pending-${card.accountId}`}>Pending</Label>
            <Input id={`pending-${card.accountId}`} inputMode="numeric" value={pending} onChange={(e) => setPending(e.target.value)} placeholder="2,030" />
          </div>
        </div>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : cash ? "Save Daily Cash" : "Save points"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RewardsRow({ card }: { card: CardRewards }) {
  const [open, setOpen] = useState(false);
  const points = card.unit === "points";
  const b = card.balance;

  return (
    <li className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3.5">
        <Link href={`/transactions?account=${encodeURIComponent(card.accountId)}`} title={`See ${card.name}'s transactions`} className="w-24 shrink-0 transition-transform hover:-translate-y-0.5">
          <CardArt program={card.program} mask={card.mask} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">{card.name}</span>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} ${card.name} details`}
              title="Details"
              className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-bone/6 hover:text-bone"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          </div>
          {points && b ? (
            <>
              <span className="font-mono text-xl font-semibold text-bone tabular-nums">{pts(b.total)}</span>
              <span className="truncate text-xs text-muted-foreground">
                points{b.since > 0 ? ` · incl. ~${pts(b.since)} since ${shortDate(b.asOf)}` : ` · as of ${shortDate(b.asOf)}`}
              </span>
            </>
          ) : points ? (
            <>
              <span className="font-mono text-xl font-semibold text-bone tabular-nums">+{pts(card.thisYear)}</span>
              <span className="text-xs text-muted-foreground">points earned this year</span>
            </>
          ) : b ? (
            <>
              <span className="font-mono text-xl font-semibold text-bone tabular-nums">{formatCurrency(b.total, "USD")}</span>
              <span className="truncate text-xs text-muted-foreground">
                Daily Cash{b.since > 0 ? ` · incl. ~${formatCurrency(b.since, "USD")} since ${shortDate(b.asOf)}` : ` · as of ${shortDate(b.asOf)}`}
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-xl font-semibold text-bone tabular-nums">~{formatCurrency(card.thisYear, "USD")}</span>
              <span className="text-xs text-muted-foreground">Daily Cash this year, estimated</span>
            </>
          )}
        </div>
      </div>

      {points && b && (
        <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border text-center">
          <Stat value={pts(b.available)} label="Available" />
          <Stat value={pts(b.pending)} label="Pending" />
          <Stat value={`$${Math.round(b.total / 100).toLocaleString("en-US")}`} label="As cash" />
        </div>
      )}
      {!b && (
        <BalanceDialog
          card={card}
          trigger={
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-champagne/35 px-3 py-2 text-xs text-champagne transition-colors hover:border-champagne/60 hover:bg-champagne/[0.06]"
            >
              <Plus className="size-3.5" aria-hidden />
              {points ? "Add your balance from the Chase app" : "Add this year's Daily Cash from Wallet"}
            </button>
          }
        />
      )}

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="whitespace-nowrap text-muted-foreground">
          <span className="font-mono text-champagne tabular-nums">+{points ? pts(card.thisMonth) : formatCurrency(card.thisMonth, "USD")}</span> this month
        </span>
        {b && (
          <BalanceDialog
            card={card}
            trigger={
              <button type="button" className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-bone">
                <Pencil className="size-3" aria-hidden />
                {points ? "Update balance" : "Update"}
              </button>
            }
          />
        )}
      </div>

      {card.quarter && card.quarter.categories.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground" title={card.quarter.categories.join(", ")}>
              <span className="text-bone">5%</span> · {card.quarter.categories.join(", ")}
            </span>
            <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
              {formatCurrency(card.quarter.used, "USD").replace(/\.\d\d$/, "")} / {formatCurrency(card.quarter.cap, "USD").replace(/\.00$/, "")}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${card.name} 5% categories used this quarter`}
            aria-valuemin={0}
            aria-valuemax={card.quarter.cap}
            aria-valuenow={Math.round(card.quarter.used)}
            className="h-1.5 w-full overflow-hidden rounded-full bg-bone/8"
          >
            <div className="h-full rounded-full bg-champagne" style={{ width: `${Math.min(1, card.quarter.used / card.quarter.cap) * 100}%` }} />
          </div>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Earned this year (estimated)</span>
            <span className="font-mono tabular-nums">{fmt(card.unit, card.thisYear)}</span>
          </div>
          {card.byWhy.map((w) => (
            <div key={w.why} className="flex justify-between">
              <span className="text-muted-foreground">{w.why}</span>
              <span className="font-mono tabular-nums">{fmt(card.unit, w.earned)}</span>
            </div>
          ))}
          {card.quarter && (
            <p className="text-muted-foreground">5% categories run until {shortDate(card.quarter.ends)}. Activate each quarter in the Chase app.</p>
          )}
          <p className="text-muted-foreground">
            {points
              ? "Estimates go by each purchase's category at the card's rates; your balance also counts bonuses, transfers and redemptions."
              : "Estimated from imported statements: 3% at Apple and its partners, 2% for the rest (as Apple Pay). Wallet's total also counts promotions and months not imported."}
          </p>
        </div>
      )}
    </li>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-1.5 py-2">
      <span className="font-mono text-sm text-bone tabular-nums">{value}</span>
      <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

/** What a card's rewards are worth in dollars (points at 1¢), so points and Daily Cash can be ranked together. */
function worth(card: CardRewards): number {
  const amount = card.balance ? card.balance.total : card.thisYear;
  return card.unit === "points" ? amount / 100 : amount;
}

/**
 * Each rewards card as a picture of the card with its points: the balance
 * you copied from the card's app (plus estimates since), what this month
 * added, Freedom Flex's 5% progress, and the breakdown on request.
 */
export function RewardsCard({ cards }: { cards: CardRewards[] }) {
  if (cards.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rewards</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {[...cards].sort((a, b) => worth(b) - worth(a)).map((c) => (
            <RewardsRow key={c.accountId} card={c} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
