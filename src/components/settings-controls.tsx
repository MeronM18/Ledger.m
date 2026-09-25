"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, LayoutGrid, LogOut, Unplug } from "lucide-react";
import { toast } from "sonner";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DISPLAY_NAME_MAX, THRESHOLD_LIMITS, type AlertThresholds } from "@/lib/app-preferences";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Something went wrong");
  }
}

/** A labeled row: what it is on the left, the control on the right. */
export function SettingRow({ label, description, children, htmlFor }: { label: string; description?: React.ReactNode; children?: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <label htmlFor={htmlFor} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-bone">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </label>
      {children}
    </div>
  );
}

// ---- Profile ----------------------------------------------------------------

export function DisplayNameForm({ initial, fallback }: { initial: string; fallback: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== initial;

  async function save() {
    setSaving(true);
    try {
      await send("/api/settings", "PATCH", { displayName: name.trim() || null });
      toast.success("Name saved");
      if (!name.trim()) setName(fallback);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex w-full items-center gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input id="display-name" value={name} maxLength={DISPLAY_NAME_MAX} onChange={(e) => setName(e.target.value)} className="h-8 sm:w-56" />
      <Button type="submit" size="sm" variant="outline" disabled={!changed || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** Sign out here, or everywhere (the phone included), then back to sign in. */
export function SignOutButtons() {
  const [busy, setBusy] = useState<"local" | "global" | null>(null);
  async function signOut(scope: "local" | "global") {
    setBusy(scope);
    const { error } = await createClient().auth.signOut({ scope });
    if (error) {
      toast.error("Couldn't sign out", { description: error.message });
      setBusy(null);
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a real round trip, so nothing signed-in stays cached
    window.location.href = "/login";
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => signOut("local")} disabled={busy !== null}>
        <LogOut className="size-3.5" />
        {busy === "local" ? "Signing out…" : "Sign out"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => signOut("global")} disabled={busy !== null}>
        {busy === "global" ? "Signing out…" : "Sign out everywhere"}
      </Button>
    </div>
  );
}

// ---- Alerts -----------------------------------------------------------------

export function TestAlertButton() {
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    try {
      await send("/api/notify/test", "POST");
      toast.success("Test alert sent. It should reach your phone in a few seconds.");
    } catch {
      toast.error("The test alert didn't send. Check the ntfy topic and server.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={test} disabled={busy}>
      <BellRing className="size-3.5" />
      {busy ? "Sending…" : "Send a test alert"}
    </Button>
  );
}

const THRESHOLD_FIELDS: { key: keyof AlertThresholds; label: string; description: string; prefix?: string; suffix?: string }[] = [
  { key: "largeCharge", label: "Large charge", description: "A single charge this big or bigger gets its own push.", prefix: "$" },
  { key: "lowBalance", label: "Low balance", description: "Checking or savings under this sets off an alert, and the forecast warns before it.", prefix: "$" },
  { key: "renewalDaysAhead", label: "Renewal heads-up", description: "How far ahead a subscription renewal is announced.", suffix: "days" },
];

/** The amounts and days alerts go by. */
export function ThresholdsForm({ initial, defaults }: { initial: AlertThresholds; defaults: AlertThresholds }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<keyof AlertThresholds, string>>({
    largeCharge: String(initial.largeCharge),
    lowBalance: String(initial.lowBalance),
    renewalDaysAhead: String(initial.renewalDaysAhead),
  });
  const [saving, setSaving] = useState(false);

  const parsed = Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f.key, Number(values[f.key])])) as AlertThresholds;
  const invalid = THRESHOLD_FIELDS.filter(({ key }) => {
    const v = parsed[key];
    const { min, max } = THRESHOLD_LIMITS[key];
    return values[key].trim() === "" || !Number.isFinite(v) || v < min || v > max || (key === "renewalDaysAhead" && !Number.isInteger(v));
  }).map((f) => f.key);
  const changed = THRESHOLD_FIELDS.some(({ key }) => parsed[key] !== initial[key]);

  async function save() {
    setSaving(true);
    try {
      await send("/api/settings", "PATCH", { thresholds: parsed });
      toast.success("Alert thresholds saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the thresholds");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid.length === 0 && changed) void save();
      }}
    >
      {THRESHOLD_FIELDS.map((f) => {
        const { min, max } = THRESHOLD_LIMITS[f.key];
        const bad = invalid.includes(f.key);
        return (
          <SettingRow
            key={f.key}
            htmlFor={`threshold-${f.key}`}
            label={f.label}
            description={
              <>
                {f.description}{" "}
                {parsed[f.key] !== defaults[f.key] && (
                  <span className="text-muted-foreground/70">
                    Default {f.prefix ? formatCurrency(defaults[f.key], "USD") : `${defaults[f.key]} ${f.suffix}`}.
                  </span>
                )}
              </>
            }
          >
            <span className="relative flex items-center">
              {f.prefix && <span className="pointer-events-none absolute left-2.5 text-sm text-muted-foreground">{f.prefix}</span>}
              <Input
                id={`threshold-${f.key}`}
                type="number"
                inputMode={f.key === "renewalDaysAhead" ? "numeric" : "decimal"}
                min={min}
                max={max}
                step={f.key === "renewalDaysAhead" ? 1 : "any"}
                value={values[f.key]}
                aria-invalid={bad || undefined}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className={cn("h-8 w-32 text-right font-mono tabular-nums", f.prefix && "pl-6", f.suffix && "pr-12")}
              />
              {f.suffix && <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">{f.suffix}</span>}
            </span>
          </SettingRow>
        );
      })}
      <div className="flex items-center justify-end gap-3 pt-3">
        {invalid.length > 0 && (
          <span className="text-xs text-oxblood-text">
            {invalid.map((k) => THRESHOLD_FIELDS.find((f) => f.key === k)!.label).join(", ")}{" "}
            {invalid.length === 1 ? "is" : "are"} out of range.
          </span>
        )}
        <Button type="submit" size="sm" disabled={!changed || invalid.length > 0 || saving}>
          {saving ? "Saving…" : "Save thresholds"}
        </Button>
      </div>
    </form>
  );
}

// ---- Connections ------------------------------------------------------------

export type ConnectionAccount = { id: string; name: string; detail: string; hidden: boolean; balance: number | null };
export type Connection = { id: string; institution: string; status: string; ok: boolean; accounts: ConnectionAccount[] };

function HideSwitch({ account }: { account: ConnectionAccount }) {
  const router = useRouter();
  const [shown, setShown] = useState(!account.hidden);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setShown(next);
    setSaving(true);
    try {
      await send(`/api/accounts/${account.id}`, "PATCH", { is_hidden: !next });
      toast.success(next ? `${account.name} is back in your totals` : `${account.name} is hidden`);
      router.refresh();
    } catch {
      setShown(!next);
      toast.error("Couldn't change that account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <label htmlFor={`show-${account.id}`} className={cn("flex min-w-0 flex-col", !shown && "opacity-60")}>
        <span className="truncate text-sm text-bone">{account.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {account.detail}
          {account.balance !== null ? ` · ${formatCurrency(account.balance, "USD")}` : ""}
        </span>
      </label>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {shown ? "Shown" : "Hidden"}
        <Switch id={`show-${account.id}`} checked={shown} disabled={saving} onCheckedChange={toggle} aria-label={`Show ${account.name}`} />
      </span>
    </li>
  );
}

function RemoveBankButton({ connection }: { connection: Connection }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await send(`/api/plaid/items/${connection.id}`, "DELETE");
      toast.success(`${connection.institution} is disconnected`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect the bank");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-oxblood-text hover:text-oxblood-text">
          <Unplug className="size-3.5" />
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {connection.institution}?</DialogTitle>
          <DialogDescription>
            It stops syncing, and its {connection.accounts.length} account{connection.accounts.length === 1 ? "" : "s"} are deleted
            here with their transactions and recurring charges. Your own entries, imports, budgets and goals stay. To just
            keep an account out of your totals, hide it instead.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy ? "Removing…" : `Remove ${connection.institution}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Each connected bank: its status, its accounts with a show/hide switch each, and removing it. */
export function ConnectionsList({ connections }: { connections: Connection[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {connections.map((c) => (
        <li key={c.id} className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <InstitutionAvatar institution={c.institution} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-bone">{c.institution}</span>
                <span className={cn("text-xs", c.ok ? "text-muted-foreground" : "text-oxblood-text")}>{c.status}</span>
              </span>
            </span>
            <RemoveBankButton connection={c} />
          </div>
          {c.accounts.length > 0 && <ul className="divide-y divide-border px-3">{c.accounts.map((a) => <HideSwitch key={a.id} account={a} />)}</ul>}
        </li>
      ))}
    </ul>
  );
}

// ---- Layout -----------------------------------------------------------------

export function ResetLayoutButton({ customized }: { customized: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    try {
      await send("/api/card-order", "DELETE");
      toast.success("Cards are back in their default order");
      router.refresh();
    } catch {
      toast.error("Couldn't reset the layout");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={reset} disabled={busy || !customized}>
      <LayoutGrid className="size-3.5" />
      {busy ? "Resetting…" : "Reset card order"}
    </Button>
  );
}
