"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowLeftRight,
  Banknote,
  Check,
  CircleCheck,
  HandCoins,
  Landmark,
  Plus,
  Receipt,
  Search,
  Split,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggestCharges, type ChargeOption, type DepositToReview, type ReviewedDeposit } from "@/lib/deposit-review";
import { formatCurrency } from "@/lib/format";
import { ALL_PFC_CATEGORIES, humanizeCategory, isSpendingCategory } from "@/lib/plaid-categories";
import { prettyName } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

const usd = (n: number) => formatCurrency(n, "USD");
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const accountLabel = (a: DepositToReview["account"]) => (a ? `${prettyName(a.name)}${a.mask ? ` ••${a.mask}` : ""}` : "");
const cents = (n: number) => Math.round(n * 100);
const SPENDING_CATEGORIES = ALL_PFC_CATEGORIES.filter((c) => isSpendingCategory(c) && c !== "LOAN_PAYMENTS");
// Shown before "Show all".
const SHOWN = 4;

type Kind = "income" | "charge" | "cash-purchase" | "cash" | "account";

const KINDS: { kind: Kind; label: string; Icon: LucideIcon; hint: string }[] = [
  { kind: "income", label: "Income", Icon: TrendingUp, hint: "Counts toward your income." },
  { kind: "charge", label: "Paid back a charge", Icon: Receipt, hint: "Comes off a card or bank charge, so only your share of it is spending." },
  { kind: "cash-purchase", label: "Paid back cash I spent", Icon: Banknote, hint: "Records what you paid in cash; only your share of it is spending." },
  { kind: "cash", label: "From my cash", Icon: Wallet, hint: "Cash you deposited, or handed over in exchange. Your Cash on Accounts goes down by this much." },
  { kind: "account", label: "From my other account", Icon: Landmark, hint: "A transfer from savings, another bank or an app in your name." },
];

type Purchase = { name: string; total: string; category: string; date: string };
type Part = {
  key: number;
  kind: Kind;
  amount: string;
  // The last part takes whatever's left until its amount is typed.
  auto: boolean;
  charge: ChargeOption | null;
  purchase: Purchase;
};

type Body =
  | { answer: "income"; amount: number }
  | { answer: "own-money"; amount: number; from: "cash" | "account" }
  | { answer: "paid-back"; amount: number; charge: { id: string; manual: boolean } }
  | { answer: "paid-back-cash"; amount: number; purchase: { name: string; amount: number; category: string; date: string } };

let nextKey = 1;
function newPart(deposit: DepositToReview, kind: Kind, amount = "", auto = false): Part {
  return { key: nextKey++, kind, amount, auto, charge: null, purchase: { name: "", total: "", category: "FOOD_AND_DRINK", date: deposit.date } };
}

async function save(id: string, parts: Body[], replace: boolean): Promise<string> {
  const res = await fetch(`/api/deposits/${id}/review`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts, replace }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save your answer");
  return data.message ?? "Saved";
}

type Editing = { deposit: DepositToReview; parts: Part[]; replace: boolean };

/**
 * Deposits that aren't a paycheck or interest, each asking what it was:
 * income, someone paying you back, or your own money, or a mix of them
 * (a $150 Zelle that's $100 for cash you handed over and $50 income).
 *
 * On the Overview ("overview") only while something is waiting, with a link
 * to the Deposits page; there ("page") the ones waiting and, below them,
 * every one answered, to change or undo.
 */
export function DepositReviewCard({
  deposits,
  reviewed,
  charges,
  variant = "overview",
}: {
  deposits: DepositToReview[];
  reviewed: ReviewedDeposit[];
  charges: ChargeOption[];
  variant?: "overview" | "page";
}) {
  const router = useRouter();
  // Answered here: hidden at once, before the page refreshes.
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const open = deposits.filter((d) => !answered.has(d.id));
  const onPage = variant === "page";
  if (!onPage && open.length === 0) return null;

  async function answer(deposit: DepositToReview, parts: Body[], replace = false) {
    setBusy(deposit.id);
    try {
      const message = await save(deposit.id, parts, replace);
      setAnswered((s) => new Set(s).add(deposit.id));
      setEditing(null);
      toast.success(message, replace ? undefined : { action: { label: "Undo", onClick: () => void undo(deposit, false) } });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your answer");
    } finally {
      setBusy(null);
    }
  }

  async function undo(deposit: DepositToReview, announce = true) {
    setBusy(deposit.id);
    try {
      const res = await fetch(`/api/deposits/${deposit.id}/review`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAnswered((s) => {
        const next = new Set(s);
        next.delete(deposit.id);
        return next;
      });
      if (announce) toast.success(`${deposit.name} is back in Deposits to review`);
      router.refresh();
    } catch {
      toast.error("Couldn't undo that");
    } finally {
      setBusy(null);
    }
  }

  const startEditing = (deposit: DepositToReview, kinds: Kind[]) =>
    setEditing({
      deposit,
      replace: false,
      parts: kinds.map((k, i) => newPart(deposit, k, kinds.length === 1 ? String(deposit.amount) : "", i === kinds.length - 1)),
    });

  function change(r: ReviewedDeposit) {
    const parts = r.parts.map((p, i) => {
      const kind: Kind =
        p.answer === "income" ? "income" : p.answer === "paid-back" ? "charge" : p.answer === "paid-back-cash" ? "cash-purchase" : p.from === "cash" ? "cash" : "account";
      const part = newPart(r, kind, String(p.amount), i === r.parts.length - 1);
      if (p.charge) part.charge = p.charge;
      if (kind === "cash-purchase") part.purchase = { ...part.purchase, name: p.name ?? "", total: String(p.amount) };
      return part;
    });
    setEditing({ deposit: r, parts, replace: true });
  }

  const shown = showAll || onPage ? open : open.slice(0, SHOWN);

  const editor = (
    <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {editing && (
          <DepositEditor
            key={editing.deposit.id}
            editing={editing}
            charges={charges}
            busy={busy === editing.deposit.id}
            onSave={(parts) => answer(editing.deposit, parts, editing.replace)}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  const toReview =
    open.length > 0 ? (
      <section id="deposits-to-review" aria-label="Deposits to review" className="scroll-mt-6 rounded-xl border border-champagne/25 bg-card">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne/12 text-champagne">
            <HandCoins className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-bone">
              Deposits to review
              <span className="rounded-full bg-champagne/15 px-1.5 py-px font-mono text-[11px] text-champagne tabular-nums">{open.length}</span>
            </h2>
            <p className="text-xs text-muted-foreground">Money that came in and isn&apos;t a paycheck or interest. Say what it was so income and spending stay right.</p>
          </div>
          {!onPage && (
            <Link href="/transactions/deposits" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-champagne">
              All deposits <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
        <ul aria-label="To review" className="border-t border-border">
          {shown.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 border-b border-border px-5 py-3 last:border-b-0 lg:flex-row lg:items-center">
              <DepositLine deposit={d} />
              <div className="flex flex-wrap gap-1.5 lg:shrink-0" role="group" aria-label={`What was ${usd(d.amount)} from ${d.name}?`}>
                <AnswerButton Icon={TrendingUp} label="Income" disabled={busy === d.id} onClick={() => answer(d, [{ answer: "income", amount: d.amount }])} />
                <AnswerButton Icon={HandCoins} label="Paid me back" disabled={busy === d.id} onClick={() => startEditing(d, ["charge"])} />
                <AnswerButton Icon={ArrowLeftRight} label="My own money" disabled={busy === d.id} onClick={() => startEditing(d, ["cash"])} />
                <AnswerButton Icon={Split} label="Split" disabled={busy === d.id} onClick={() => startEditing(d, ["cash", "income"])} />
              </div>
            </li>
          ))}
        </ul>
        {!onPage && open.length > SHOWN && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-border px-5 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-champagne">
            {showAll ? "Show fewer" : `Show all ${open.length}`}
          </button>
        )}
      </section>
    ) : (
      <div role="status" className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-moss/12 text-moss">
          <CircleCheck className="size-4" aria-hidden />
        </span>
        <p className="text-sm text-bone">
          Every deposit is reviewed. <span className="text-muted-foreground">New ones that aren&apos;t pay or interest show up here and on the Overview.</span>
        </p>
      </div>
    );

  if (!onPage) {
    return (
      <>
        {toReview}
        {editor}
      </>
    );
  }

  return (
    <>
      {toReview}
      <section aria-label="Reviewed" className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-0.5 px-5 py-3.5">
          <h2 className="text-sm font-medium text-bone">
            Reviewed <span className="font-mono text-xs text-muted-foreground tabular-nums">{reviewed.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground">What you said each deposit was. Change or undo any of them; undoing puts it back up top.</p>
        </div>
        {reviewed.length === 0 ? (
          <p className="border-t border-border px-5 py-6 text-center text-sm text-muted-foreground">Nothing reviewed yet.</p>
        ) : (
          <ul aria-label="Reviewed deposits" className="border-t border-border">
            {reviewed.map((r) => (
              <li key={r.id} className="flex flex-col gap-2.5 border-b border-border px-5 py-3 last:border-b-0 lg:flex-row lg:items-center">
                <DepositLine deposit={r} />
                <div className="flex flex-wrap items-center gap-1.5 lg:max-w-[22rem] lg:justify-end">
                  {r.parts.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-bone/6 px-2 py-0.5 text-[11px] text-bone/85 ring-1 ring-bone/10 ring-inset">
                      {p.label}
                      {r.parts.length > 1 && <span className="font-mono text-muted-foreground tabular-nums">{usd(p.amount)}</span>}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1 lg:shrink-0" role="group" aria-label={`${usd(r.amount)} from ${r.name}`}>
                  <Button type="button" variant="ghost" size="sm" disabled={busy === r.id} onClick={() => change(r)}>
                    Change
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy === r.id} onClick={() => undo(r)} className="text-muted-foreground">
                    Undo
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editor}
    </>
  );
}

function DepositLine({ deposit: d }: { deposit: DepositToReview }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-moss/12 text-moss">
        <ArrowDownLeft className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-bone">{d.name}</span>
          {d.pending && <span className="shrink-0 text-[11px] text-champagne">Pending</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground" title={d.detail ?? undefined}>
          {[d.detail, accountLabel(d.account), dayLabel(d.date)].filter(Boolean).join(" · ")}
        </span>
      </div>
      <span className="shrink-0 font-mono text-sm text-moss tabular-nums">+{usd(d.amount)}</span>
    </div>
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

/** Each part's amount: as typed, or for the last part until it's typed, whatever the others leave. */
function amountsOf(parts: Part[], total: number): number[] {
  const typed = parts.map((p) => (p.auto ? null : Number(p.amount)));
  const others = typed.reduce<number>((s, v) => s + (v !== null && Number.isFinite(v) ? v : 0), 0);
  return typed.map((v) => (v === null ? Math.max(0, Math.round((total - others) * 100) / 100) : Number.isFinite(v) ? v : 0));
}

/** Why a part isn't ready to save, or null. */
function problemWith(part: Part, amount: number): string | null {
  if (!(amount > 0)) return "Enter an amount for each part";
  if (part.kind === "charge" && !part.charge) return "Pick the charge they paid back";
  if (part.kind === "cash-purchase") {
    if (!part.purchase.name.trim()) return "Say what you paid for in cash";
    if (part.purchase.total !== "" && !(Number(part.purchase.total) > 0)) return "Enter what you paid in cash";
  }
  return null;
}

function toBody(part: Part, amount: number): Body {
  switch (part.kind) {
    case "income":
      return { answer: "income", amount };
    case "cash":
      return { answer: "own-money", amount, from: "cash" };
    case "account":
      return { answer: "own-money", amount, from: "account" };
    case "charge":
      return { answer: "paid-back", amount, charge: { id: part.charge!.id, manual: part.charge!.manual } };
    case "cash-purchase":
      return {
        answer: "paid-back-cash",
        amount,
        // Left blank, what you paid is what you were paid back.
        purchase: { name: part.purchase.name.trim(), amount: Math.round((Number(part.purchase.total) || amount) * 100) / 100, category: part.purchase.category, date: part.purchase.date },
      };
  }
}

/**
 * What a deposit was, in one part or several: each part an amount and what
 * it was. The parts have to add up to the deposit; the last one fills in
 * what's left.
 */
function DepositEditor({ editing, charges, busy, onSave }: { editing: Editing; charges: ChargeOption[]; busy: boolean; onSave: (parts: Body[]) => void }) {
  const { deposit } = editing;
  const [parts, setParts] = useState<Part[]>(editing.parts);
  const amounts = amountsOf(parts, deposit.amount);
  const left = (cents(deposit.amount) - amounts.reduce((s, a) => s + cents(a), 0)) / 100;
  const problem = parts.map((p, i) => problemWith(p, amounts[i])).find(Boolean) ?? (left !== 0 ? (left > 0 ? `${usd(left)} left to assign` : `${usd(-left)} more than the deposit`) : null);

  const update = (key: number, change: Partial<Part>) => setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...change } : p)));
  function addPart() {
    setParts((ps) => [...ps.map((p, i) => ({ ...p, auto: false, amount: String(amounts[i] || "") })), newPart(deposit, "income", "", true)]);
  }
  function removePart(key: number) {
    setParts((ps) => {
      const rest = ps.filter((p) => p.key !== key);
      return rest.map((p, i) => (i === rest.length - 1 ? { ...p, auto: true } : p));
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing.replace ? "Change what this deposit was" : parts.length > 1 ? "Split this deposit" : "What was this deposit?"}</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-moss tabular-nums">+{usd(deposit.amount)}</span> from {deposit.name} on {dayLabel(deposit.date)}
          {deposit.detail ? ` (${deposit.detail})` : ""}.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem) return void toast.error(problem);
          onSave(parts.map((p, i) => toBody(p, amounts[i])));
        }}
      >
        {parts.map((part, i) => (
          <PartEditor
            key={part.key}
            index={i}
            count={parts.length}
            part={part}
            amount={amounts[i]}
            deposit={deposit}
            charges={charges}
            onChange={(change) => update(part.key, change)}
            onRemove={() => removePart(part.key)}
          />
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={addPart} disabled={parts.length >= 6} className="text-muted-foreground hover:text-champagne">
            <Plus aria-hidden />
            {parts.length > 1 ? "Add another part" : "Split into parts"}
          </Button>
          <span role="status" className={cn("text-xs", left === 0 ? "text-moss" : "text-champagne")}>
            {parts.length > 1 && (left === 0 ? `Adds up to ${usd(deposit.amount)}` : left > 0 ? `${usd(left)} left to assign` : `${usd(-left)} over`)}
          </span>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy || problem !== null}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </>
  );
}

function PartEditor({
  index,
  count,
  part,
  amount,
  deposit,
  charges,
  onChange,
  onRemove,
}: {
  index: number;
  count: number;
  part: Part;
  amount: number;
  deposit: DepositToReview;
  charges: ChargeOption[];
  onChange: (change: Partial<Part>) => void;
  onRemove: () => void;
}) {
  const kind = KINDS.find((k) => k.kind === part.kind)!;
  const name = count > 1 ? `Part ${index + 1}` : "What it was";
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
      <legend className="sr-only">{name}</legend>
      {count > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{name}</span>
          <div className="relative ml-auto w-32">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              aria-label={`${name} amount`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={part.auto ? String(amount || "") : part.amount}
              placeholder="0.00"
              onChange={(e) => onChange({ amount: e.target.value, auto: false })}
              className="pl-6 text-right font-mono tabular-nums"
            />
          </div>
          <button type="button" onClick={onRemove} aria-label={`Remove ${name.toLowerCase()}`} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-bone">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <div role="radiogroup" aria-label={`${name}: what it was`} className="flex flex-wrap gap-1.5">
        {KINDS.map(({ kind: k, label, Icon }) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={part.kind === k}
            onClick={() => onChange({ kind: k })}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
              part.kind === k ? "border-champagne/60 bg-champagne/12 text-champagne" : "border-border text-muted-foreground hover:border-bone/25 hover:text-bone"
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{kind.hint}</p>

      {part.kind === "charge" && <ChargePicker deposit={{ date: deposit.date, amount }} charges={charges} picked={part.charge} onPick={(charge) => onChange({ charge })} />}
      {part.kind === "cash-purchase" && <PurchaseFields id={`part-${part.key}`} purchase={part.purchase} paidBack={amount} onChange={(purchase) => onChange({ purchase })} />}
    </fieldset>
  );
}

function ChargePicker({ deposit, charges, picked, onPick }: { deposit: { date: string; amount: number }; charges: ChargeOption[]; picked: ChargeOption | null; onPick: (c: ChargeOption) => void }) {
  const [query, setQuery] = useState("");
  const suggested = useMemo(() => suggestCharges(deposit, charges), [deposit, charges]);
  const q = query.trim().toLowerCase();
  const found = q ? charges.filter((c) => c.name.toLowerCase().includes(q) || (c.account ?? "").toLowerCase().includes(q)).slice(0, 8) : suggested;
  // The one picked stays in view whatever the search shows.
  const list = picked && !found.some((c) => c.id === picked.id) ? [picked, ...found] : found;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search charges" aria-label="Search charges" className="pl-8" />
      </div>
      {!q && <p className="text-xs text-muted-foreground">{suggested.length ? "Likely matches" : "No likely match. Search for the charge."}</p>}
      <div role="radiogroup" aria-label="The charge they paid back" className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
        {list.map((c) => {
          const selected = picked?.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(c)}
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
    </div>
  );
}

function PurchaseFields({ id, purchase, paidBack, onChange }: { id: string; purchase: Purchase; paidBack: number; onChange: (p: Purchase) => void }) {
  const total = Number(purchase.total) || paidBack;
  const valid = Number.isFinite(total) && total > 0;
  const share = valid ? Math.max(0, total - paidBack) : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>What you paid for</Label>
        <Input id={`${id}-name`} value={purchase.name} onChange={(e) => onChange({ ...purchase, name: e.target.value })} placeholder="e.g. Dinner at Olive Garden" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-total`}>You paid, in all</Label>
          <Input id={`${id}-total`} type="number" inputMode="decimal" min="0" step="0.01" value={purchase.total} placeholder={paidBack ? String(paidBack) : "0.00"} onChange={(e) => onChange({ ...purchase, total: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-date`}>On</Label>
          <Input id={`${id}-date`} type="date" value={purchase.date} onChange={(e) => onChange({ ...purchase, date: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <Select value={purchase.category} onValueChange={(v) => onChange({ ...purchase, category: v })}>
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
      {valid && (
        <p className="text-xs text-muted-foreground">
          Added as a cash purchase of {usd(total)}, which comes out of your Cash on Accounts. {share > 0 ? `Your share, ${usd(share)}, counts as spending.` : "None of it counts as your spending."}
        </p>
      )}
    </div>
  );
}
