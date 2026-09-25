"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeviceArt } from "@/components/device-art";
import { PillStrip } from "@/components/overview/stat-tile";
import { formatCurrency } from "@/lib/format";
import { ICON_LABELS, INSTALLMENT_ICONS, type InstallmentIcon, type InstallmentPlan } from "@/lib/installments";
import { cn } from "@/lib/utils";

const MONEY = "font-mono tabular-nums";

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "$799" large with ".50" small beside it. */
function Amount({ value }: { value: number }) {
  const [dollars, cents] = formatCurrency(value, "USD").split(".");
  return (
    <>
      {dollars}
      <span className="text-[0.55em] text-bone/60">.{cents ?? "00"}</span>
    </>
  );
}

async function send(method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<void> {
  const res = await fetch("/api/installments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to save");
  }
}

function Schedule({ plan, todayIso }: { plan: InstallmentPlan; todayIso: string }) {
  return (
    <ol className="mt-1 flex flex-col rounded-[10px] bg-muted/30 px-3 py-1 text-sm">
      {plan.schedule.map((p) => {
        const missing = p.status === "paid" && !p.charge;
        return (
          <li key={p.n} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-2 last:border-b-0">
            <span className="text-xs text-muted-foreground tabular-nums">{p.n}</span>
            <span className="flex min-w-0 flex-col">
              <span className={cn("truncate", p.status === "paid" ? "text-muted-foreground" : "text-bone")}>{longDate(p.date)}</span>
              <span className="text-xs text-muted-foreground">
                {p.status === "due"
                  ? p === plan.next
                    ? p.date === todayIso
                      ? "Charging today"
                      : "Next"
                    : "Coming up"
                  : missing
                    ? "Charged, not imported yet"
                    : "Paid"}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {p.status === "paid" && <Check className="size-3.5 text-muted-foreground" aria-label="Paid" />}
              <span className={cn(MONEY, p.status === "paid" ? "text-muted-foreground" : "text-bone")}>{formatCurrency(p.amount, "USD")}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PlanRow({ plan, todayIso, onEdit }: { plan: InstallmentPlan; todayIso: string; onEdit: (plan: InstallmentPlan) => void }) {
  const [open, setOpen] = useState(false);
  const tone = plan.done ? "var(--color-moss)" : "var(--color-champagne)";
  const scheduleId = `schedule-${plan.key.replace(/[^a-z0-9-]/gi, "")}`;

  return (
    <li className="border-t border-border py-5 first:border-t-0 first:pt-1 last:pb-1">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 @xl/inst:grid-cols-[8.5rem_minmax(0,1fr)_auto] @xl/inst:gap-x-6">
        <DeviceArt icon={plan.icon} progress={plan.progress} done={plan.done} className="w-full" />

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1">
            <h3 className="truncate text-base font-medium text-bone">{plan.name}</h3>
            <Button size="icon-xs" variant="ghost" aria-label={`Edit ${plan.name}`} onClick={() => onEdit(plan)} className="shrink-0 text-muted-foreground">
              <Pencil className="size-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className={MONEY}>{formatCurrency(plan.monthly, "USD")}</span> a month · {plan.payments} payments
            {plan.accountName ? ` · ${plan.accountName}` : ""}
          </p>
          {!plan.named && (
            <button type="button" onClick={() => onEdit(plan)} className="self-start text-left text-xs text-champagne underline-offset-4 hover:underline">
              Name it and pick what it is
            </button>
          )}
        </div>

        <div className="col-span-2 flex items-end justify-between gap-4 @xl/inst:col-span-1 @xl/inst:flex-col @xl/inst:items-end @xl/inst:justify-center @xl/inst:gap-1 @xl/inst:text-right">
          <div className="flex flex-col gap-1 @xl/inst:items-end">
            <span className="text-xs text-muted-foreground">{plan.done ? "Paid off" : "Left to pay"}</span>
            <span className="font-serif text-[1.75rem] leading-none font-medium tracking-[-0.01em] text-bone">
              <Amount value={plan.done ? plan.price : plan.leftAmount} />
            </span>
          </div>
          <span className="text-xs text-muted-foreground @xl/inst:mt-1">
            {plan.done ? `Last payment ${shortDate(plan.payoff)}` : `Paid off ${monthYear(plan.payoff)}`}
          </span>
        </div>

        <div className="col-span-2 flex flex-col gap-2 @xl/inst:col-span-3">
          <PillStrip levels={plan.schedule.map((p) => (p.status === "paid" ? 1 : null))} color={tone} className="h-7 @xl/inst:h-8" />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="text-bone tabular-nums">
                {plan.paid} of {plan.payments}
              </span>{" "}
              paid · <span className={MONEY}>{formatCurrency(plan.paidAmount, "USD")}</span> of{" "}
              <span className={MONEY}>{formatCurrency(plan.price, "USD")}</span>
              {plan.next && (
                <>
                  {" "}
                  · next <span className={cn(MONEY, "text-bone")}>{formatCurrency(plan.next.amount, "USD")}</span> on {shortDate(plan.next.date)}
                </>
              )}
            </span>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={scheduleId}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-sm hover:text-champagne"
            >
              {open ? "Hide payments" : "See every payment"}
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          </div>
          {open && (
            <div id={scheduleId}>
              <Schedule plan={plan} todayIso={todayIso} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

type Form = { name: string; icon: InstallmentIcon; monthly: string; payments: string; start: string; price: string };

function PlanDialog({
  plan,
  open,
  onOpenChange,
}: {
  // null: adding a plan of your own.
  plan: InstallmentPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const found = plan?.source === "detected";
  const [form, setForm] = useState<Form>(() => ({
    name: plan?.named ? plan.name : "",
    icon: plan?.icon ?? "laptop",
    monthly: plan ? String(plan.monthly) : "",
    payments: plan ? String(plan.payments) : "12",
    start: plan?.schedule[0]?.date ?? "",
    price: plan && Math.abs(plan.price - plan.monthly * plan.payments) >= 0.01 ? String(plan.price) : "",
  }));
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  async function run(action: () => Promise<void>, done: string) {
    setSaving(true);
    try {
      await action();
      toast.success(done);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function save() {
    const name = form.name.trim();
    const payments = Number(form.payments);
    const monthly = Number(form.monthly);
    const price = form.price.trim() === "" ? null : Number(form.price.replace(/[$,]/g, ""));
    if (!name) return void toast.error("Give it a name, like MacBook Air");
    if (!Number.isInteger(payments) || payments < 1 || payments > 60) return void toast.error("Payments is a whole number, 1 to 60");
    if (price !== null && !(price > 0)) return void toast.error("Enter the price in dollars, or leave it blank");
    if (!found && !(monthly > 0)) return void toast.error("Enter the monthly payment");
    if (!found && !/^\d{4}-\d{2}-\d{2}$/.test(form.start)) return void toast.error("Enter the day of the first payment");

    const settings = found
      ? { name, icon: form.icon, payments, price }
      : { name, icon: form.icon, payments, price, monthly, start: form.start };
    void run(() => (plan ? send("PATCH", { key: plan.key, settings }) : send("POST", settings)), plan ? "Saved" : `${name} added`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.named ? plan.name : "installment"}` : "Add an installment plan"}</DialogTitle>
          <DialogDescription>
            {found
              ? `Found on ${plan.accountName ?? "your card"}: ${formatCurrency(plan.monthly, "USD")} a month from ${longDate(plan.schedule[0].date)}.`
              : "A purchase you're paying off in equal monthly payments."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">What it is</legend>
            <div role="radiogroup" aria-label="What it is" className="grid grid-cols-3 gap-1.5">
              {INSTALLMENT_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={form.icon === icon}
                  onClick={() => set({ icon })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 pt-2 pb-1.5 text-xs transition-colors",
                    form.icon === icon
                      ? "border-champagne/50 bg-champagne/[0.08] text-bone"
                      : "border-border text-muted-foreground hover:bg-bone/6 hover:text-bone"
                  )}
                >
                  <DeviceArt icon={icon} progress={form.icon === icon ? 0.5 : 0} animate={false} className="h-9 w-auto" />
                  {ICON_LABELS[icon]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="installment-name">Name</Label>
            <Input
              id="installment-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={form.icon === "other" ? "e.g. Couch" : `e.g. ${ICON_LABELS[form.icon]}`}
              maxLength={60}
            />
          </div>

          {!found && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="installment-monthly">Monthly payment</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">$</span>
                  <Input
                    id="installment-monthly"
                    inputMode="decimal"
                    value={form.monthly}
                    onChange={(e) => set({ monthly: e.target.value })}
                    placeholder="0.00"
                    className="pl-6 text-right font-mono tabular-nums"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="installment-start">First payment</Label>
                <Input id="installment-start" type="date" value={form.start} onChange={(e) => set({ start: e.target.value })} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="installment-payments">Payments</Label>
              <Input
                id="installment-payments"
                type="number"
                inputMode="numeric"
                min="1"
                max="60"
                value={form.payments}
                onChange={(e) => set({ payments: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="installment-price">Price (optional)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">$</span>
                <Input
                  id="installment-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => set({ price: e.target.value })}
                  placeholder={
                    Number(form.monthly) > 0 && Number(form.payments) > 0 ? (Number(form.monthly) * Number(form.payments)).toFixed(2) : "0.00"
                  }
                  className="pl-6 text-right font-mono tabular-nums"
                />
              </div>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Apple Card Monthly Installments are 12 payments for a Mac, iPad or Watch and 24 for an iPhone, at 0% interest. Leave the price
            blank and it&apos;s the monthly payment times the payments.
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          {plan ? (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              disabled={saving}
              onClick={() => void run(() => send("DELETE", { key: plan.key }), found ? "Hidden" : "Removed")}
            >
              {found ? "Not an installment" : "Remove"}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : plan ? "Save" : "Add plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Purchases being paid off month by month (Apple Card Monthly Installments,
 * found in the card's imported charges, or plans you add): what's left,
 * when it's done, and each payment.
 */
export function InstallmentsCard({ plans, todayIso }: { plans: InstallmentPlan[]; todayIso: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ plan: InstallmentPlan | null; n: number } | null>(null);
  const [showDone, setShowDone] = useState(false);

  const visible = plans.filter((p) => !p.hidden);
  const active = visible.filter((p) => !p.done);
  const done = visible.filter((p) => p.done);
  const hidden = plans.filter((p) => p.hidden);
  const perMonth = active.reduce((s, p) => s + p.monthly, 0);
  const leftTotal = active.reduce((s, p) => s + p.leftAmount, 0);
  const lastPayoff = active.map((p) => p.payoff).sort().at(-1);

  const edit = (plan: InstallmentPlan | null) => setEditing((e) => ({ plan, n: (e?.n ?? 0) + 1 }));

  async function unhide(plan: InstallmentPlan) {
    try {
      await send("PATCH", { key: plan.key, settings: { hidden: false } });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <Card role="region" aria-labelledby="installments-title">
      <CardHeader className="flex items-start justify-between gap-x-4">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle id="installments-title" className="text-sm font-normal text-muted-foreground">
            Installments
          </CardTitle>
          {active.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className={cn(MONEY, "text-bone")}>{formatCurrency(perMonth, "USD")}</span> a month ·{" "}
              <span className={MONEY}>{formatCurrency(leftTotal, "USD")}</span> left
              {lastPayoff ? ` · all paid off by ${monthYear(lastPayoff)}` : ""}
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" className="-mr-2 shrink-0 text-muted-foreground" onClick={() => edit(null)}>
          <Plus className="size-3.5" />
          Add a plan
        </Button>
      </CardHeader>
      <CardContent className="@container/inst flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border px-6 py-8 text-center">
            <DeviceArt icon="laptop" progress={0} animate={false} className="w-24 opacity-70" />
            <p className="max-w-sm text-sm text-muted-foreground">
              No installment plans yet. Apple Card Monthly Installments show up here on their own once a statement with one is imported.
            </p>
            <Button size="sm" variant="outline" onClick={() => edit(null)}>
              Add one yourself
            </Button>
          </div>
        ) : (
          <ul>
            {active.map((p) => (
              <PlanRow key={p.key} plan={p} todayIso={todayIso} onEdit={edit} />
            ))}
            {(showDone || active.length === 0) &&
              done.map((p) => <PlanRow key={p.key} plan={p} todayIso={todayIso} onEdit={edit} />)}
          </ul>
        )}

        {(done.length > 0 && active.length > 0) || hidden.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {done.length > 0 && active.length > 0 && (
              <button type="button" onClick={() => setShowDone((v) => !v)} className="hover:text-champagne" aria-expanded={showDone}>
                {showDone ? "Hide paid off" : `Paid off (${done.length})`}
              </button>
            )}
            {hidden.map((p) => (
              <span key={p.key}>
                Hidden: {formatCurrency(p.monthly, "USD")} a month on {p.accountName ?? "a card"} ·{" "}
                <button type="button" onClick={() => void unhide(p)} className="text-champagne underline-offset-4 hover:underline">
                  Show it
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>

      {editing && (
        <PlanDialog
          key={editing.n}
          plan={editing.plan}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      )}
    </Card>
  );
}
