"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, Banknote, Check, HandCoins, Landmark, Search, TrendingUp, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Segmented } from "@/components/segmented";
import { suggestCharges, type ChargeOption, type DepositToReview } from "@/lib/deposit-review";
import { formatCurrency } from "@/lib/format";
import { ALL_PFC_CATEGORIES, humanizeCategory, isSpendingCategory } from "@/lib/plaid-categories";
import { prettyName } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

const usd = (n: number) => formatCurrency(n, "USD");
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const accountLabel = (a: DepositToReview["account"]) => (a ? `${prettyName(a.name)}${a.mask ? ` ••${a.mask}` : ""}` : "");
const SPENDING_CATEGORIES = ALL_PFC_CATEGORIES.filter((c) => isSpendingCategory(c) && c !== "LOAN_PAYMENTS");
// Shown before "Show all".
const SHOWN = 4;

type Answer =
  | { answer: "income" }
  | { answer: "own-money"; from: "cash" | "account" }
  | { answer: "paid-back"; charge: { id: string; manual: boolean } }
  | { answer: "paid-back-cash"; purchase: { name: string; amount: number; category: string; date: string } };

async function send(id: string, body: Answer): Promise<string> {
  const res = await fetch(`/api/deposits/${id}/review`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save your answer");
  return data.message ?? "Saved";
}

/**
 * Deposits that aren't a paycheck or interest, each asking what it was:
 * income, someone paying you back, or your own money. Shown on the
 * Overview only while there's something to answer.
 */
export function DepositReviewCard({ deposits, charges }: { deposits: DepositToReview[]; charges: ChargeOption[] }) {
  const router = useRouter();
  // Answered here: hidden at once, before the page refreshes.
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState<{ deposit: DepositToReview; mode: "paid-back" | "own-money" } | null>(null);

  const open = deposits.filter((d) => !answered.has(d.id));
  if (open.length === 0) return null;
  const shown = showAll ? open : open.slice(0, SHOWN);

  async function answer(deposit: DepositToReview, body: Answer) {
    setBusy(deposit.id);
    try {
      const message = await send(deposit.id, body);
      setAnswered((s) => new Set(s).add(deposit.id));
      setDialog(null);
      toast.success(message, {
        action: {
          label: "Undo",
          onClick: async () => {
            const res = await fetch(`/api/deposits/${deposit.id}/review`, { method: "DELETE" });
            if (!res.ok) return void toast.error("Couldn't undo that");
            setAnswered((s) => {
              const next = new Set(s);
              next.delete(deposit.id);
              return next;
            });
            router.refresh();
          },
        },
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your answer");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="deposits-to-review" aria-label="Deposits to review" className="scroll-mt-6 rounded-xl border border-champagne/25 bg-card">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne/12 text-champagne">
          <HandCoins className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-medium text-bone">
            Deposits to review
            <span className="rounded-full bg-champagne/15 px-1.5 py-px font-mono text-[11px] text-champagne tabular-nums">{open.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground">Money that came in and isn&apos;t a paycheck or interest. Say what it was so income and spending stay right.</p>
        </div>
      </div>
      <ul className="border-t border-border">
        {shown.map((d) => (
          <li key={d.id} className="flex flex-col gap-3 border-b border-border px-5 py-3 last:border-b-0 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-moss/12 text-moss">
                <ArrowDownLeft className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-bone">{d.name}</span>
                <span className="truncate text-xs text-muted-foreground" title={d.detail ?? undefined}>
                  {[d.detail, accountLabel(d.account), dayLabel(d.date)].filter(Boolean).join(" · ")}
                </span>
              </div>
              <span className="shrink-0 font-mono text-sm text-moss tabular-nums">+{usd(d.amount)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 md:shrink-0" role="group" aria-label={`What was ${usd(d.amount)} from ${d.name}?`}>
              <AnswerButton Icon={TrendingUp} label="Income" disabled={busy === d.id} onClick={() => answer(d, { answer: "income" })} />
              <AnswerButton Icon={HandCoins} label="Paid me back" disabled={busy === d.id} onClick={() => setDialog({ deposit: d, mode: "paid-back" })} />
              <AnswerButton Icon={ArrowLeftRight} label="My own money" disabled={busy === d.id} onClick={() => setDialog({ deposit: d, mode: "own-money" })} />
            </div>
          </li>
        ))}
      </ul>
      {open.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-border px-5 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-champagne">
          {showAll ? "Show fewer" : `Show all ${open.length}`}
        </button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.mode === "paid-back" && (
            <PaidBackStep deposit={dialog.deposit} charges={charges} busy={busy === dialog.deposit.id} onAnswer={(body) => answer(dialog.deposit, body)} />
          )}
          {dialog?.mode === "own-money" && <OwnMoneyStep deposit={dialog.deposit} busy={busy === dialog.deposit.id} onAnswer={(body) => answer(dialog.deposit, body)} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AnswerButton({ Icon, label, disabled, onClick }: { Icon: LucideIcon; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClick} className="hover:border-champagne/40 hover:text-champagne">
      <Icon aria-hidden />
      {label}
    </Button>
  );
}

function DepositHeader({ deposit, title, description }: { deposit: DepositToReview; title: string; description: string }) {
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        <span className="font-mono text-moss tabular-nums">+{usd(deposit.amount)}</span> from {deposit.name} on {dayLabel(deposit.date)}. {description}
      </DialogDescription>
    </DialogHeader>
  );
}

/** A big choice: an icon, a title and what choosing it does. */
function Choice({ Icon, title, text, selected, onClick }: { Icon: LucideIcon; title: string; text: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected ?? false}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
        selected ? "border-champagne/50 bg-champagne/[0.06]" : "border-border hover:border-bone/20 hover:bg-bone/[0.03]"
      )}
    >
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", selected ? "bg-champagne/15 text-champagne" : "bg-muted text-muted-foreground")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-bone">{title}</span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

function OwnMoneyStep({ deposit, busy, onAnswer }: { deposit: DepositToReview; busy: boolean; onAnswer: (body: Answer) => void }) {
  return (
    <>
      <DepositHeader deposit={deposit} title="Your own money" description="It won't count as income. Where did it come from?" />
      <div role="radiogroup" aria-label="Where it came from" className="flex flex-col gap-2">
        <Choice
          Icon={Banknote}
          title="Cash I deposited"
          text={`Your Cash on Accounts goes down by ${usd(deposit.amount)}, since it's in the bank now.`}
          onClick={() => !busy && onAnswer({ answer: "own-money", from: "cash" })}
        />
        <Choice
          Icon={Landmark}
          title="Another account of mine"
          text="A transfer from savings, another bank or a payment app in your name. Nothing else changes."
          onClick={() => !busy && onAnswer({ answer: "own-money", from: "account" })}
        />
      </div>
    </>
  );
}

function PaidBackStep({
  deposit,
  charges,
  busy,
  onAnswer,
}: {
  deposit: DepositToReview;
  charges: ChargeOption[];
  busy: boolean;
  onAnswer: (body: Answer) => void;
}) {
  const [mode, setMode] = useState<"charge" | "cash">("charge");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ChargeOption | null>(null);
  const suggested = useMemo(() => suggestCharges(deposit, charges), [deposit, charges]);
  const q = query.trim().toLowerCase();
  const list = q ? charges.filter((c) => c.name.toLowerCase().includes(q) || (c.account ?? "").toLowerCase().includes(q)).slice(0, 8) : suggested;

  const [purchase, setPurchase] = useState({ name: "", amount: String(deposit.amount), category: "FOOD_AND_DRINK", date: deposit.date });
  const total = Number(purchase.amount);
  const validTotal = Number.isFinite(total) && total > 0;
  const share = validTotal ? Math.max(0, total - deposit.amount) : 0;

  return (
    <>
      <DepositHeader deposit={deposit} title="Someone paid you back" description="It won't count as income; it comes off what you spent instead." />
      <Segmented
        label="What they paid back"
        value={mode}
        onChange={setMode}
        options={[
          { value: "charge", label: "A charge on my card or bank" },
          { value: "cash", label: "Something I paid in cash" },
        ]}
      />

      {mode === "charge" ? (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search charges" aria-label="Search charges" className="pl-8" />
          </div>
          <p className="text-xs text-muted-foreground">{q ? "Matching charges" : suggested.length ? "Likely matches" : "No likely match. Search for the charge."}</p>
          <div role="radiogroup" aria-label="The charge they paid back" className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {list.map((c) => {
              const selected = picked?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPicked(c)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    selected ? "border-champagne/50 bg-champagne/[0.06]" : "border-border hover:border-bone/20 hover:bg-bone/[0.03]"
                  )}
                >
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-champagne bg-champagne text-onyx" : "border-bone/25")}>
                    {selected && <Check className="size-3" aria-hidden />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-bone">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{[c.account, dayLabel(c.date)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-mono text-sm text-bone tabular-nums">{usd(c.amount)}</span>
                    {c.remaining < c.amount - 0.005 && <span className="text-[11px] text-muted-foreground">{usd(c.remaining)} left</span>}
                  </span>
                </button>
              );
            })}
            {q && list.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No charges match.</p>}
          </div>
          {picked && (
            <p className="text-xs text-muted-foreground">
              {deposit.amount >= picked.remaining - 0.005
                ? `${picked.name} won't count as your spending anymore.`
                : `Your share of ${picked.name}, ${usd(picked.remaining - deposit.amount)}, is what counts as spending.`}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="button" disabled={!picked || busy} onClick={() => picked && onAnswer({ answer: "paid-back", charge: { id: picked.id, manual: picked.manual } })}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!purchase.name.trim() || !validTotal) return void toast.error("Enter what it was and what you paid");
            onAnswer({ answer: "paid-back-cash", purchase: { name: purchase.name.trim(), amount: Math.round(total * 100) / 100, category: purchase.category, date: purchase.date } });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-purchase-name">What you paid for</Label>
            <Input id="cash-purchase-name" value={purchase.name} onChange={(e) => setPurchase((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Dinner at Olive Garden" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-purchase-amount">You paid, in all</Label>
              <Input id="cash-purchase-amount" type="number" inputMode="decimal" min="0" step="0.01" value={purchase.amount} onChange={(e) => setPurchase((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-purchase-date">On</Label>
              <Input id="cash-purchase-date" type="date" value={purchase.date} onChange={(e) => setPurchase((p) => ({ ...p, date: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={purchase.category} onValueChange={(v) => setPurchase((p) => ({ ...p, category: v }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPENDING_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {humanizeCategory(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {validTotal
              ? `Added as a cash purchase of ${usd(total)}, which comes out of your Cash on Accounts. ${share > 0 ? `Your share, ${usd(share)}, counts as spending.` : "None of it counts as your spending."}`
              : "Enter what you paid in all, your share included."}
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
