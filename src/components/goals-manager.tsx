"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import type { GoalProgress } from "@/lib/goals";
import { cn } from "@/lib/utils";

const MANUAL = "__manual__";

export type GoalRow = GoalProgress & { savedManual: number; accountId: string | null };
export type AccountChoice = { id: string; label: string };

async function send(url: string, method: string, body?: unknown) {
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

function GoalDialog({
  goal,
  accounts,
  trigger,
}: {
  goal?: GoalRow;
  accounts: AccountChoice[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [date, setDate] = useState("");
  const [account, setAccount] = useState(MANUAL);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(goal?.name ?? "");
      setTarget(goal ? String(goal.target) : "");
      setSaved(goal ? String(goal.savedManual) : "");
      setDate(goal?.targetDate ?? "");
      setAccount(goal?.accountId ?? MANUAL);
    }
    setOpen(next);
  }

  async function handleSave() {
    const targetValue = Number(target);
    const savedValue = saved === "" ? 0 : Number(saved);
    if (!name.trim() || !Number.isFinite(targetValue) || targetValue <= 0 || !Number.isFinite(savedValue) || savedValue < 0) {
      toast.error("Enter a name, a target above 0, and an amount saved of 0 or more");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        target_amount: targetValue,
        // Only sent when tracking by hand, so linking an account and
        // unlinking later doesn't wipe the amount saved before.
        ...(account === MANUAL ? { saved_amount: savedValue } : {}),
        target_date: date || null,
        account_id: account === MANUAL ? null : account,
      };
      if (goal) await send(`/api/goals/${goal.id}`, "PATCH", payload);
      else await send("/api/goals", "POST", payload);
      toast.success(goal ? "Goal updated" : "Goal added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle>
          <DialogDescription>Track it by hand, or follow a connected account&apos;s balance.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-name">Name</Label>
            <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input id="goal-target" type="number" min="0" step="1" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-date">Target date (optional)</Label>
              <Input id="goal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Track progress with</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MANUAL}>Money I add by hand</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label} balance
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {account === MANUAL && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-saved">Saved so far</Label>
              <Input id="goal-saved" type="number" min="0" step="1" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyDialog({ goal }: { goal: GoalRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");

  async function handleSave() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      toast.error("Enter an amount (use a minus sign to take money out)");
      return;
    }
    setSaving(true);
    try {
      await send(`/api/goals/${goal.id}`, "PATCH", { add_amount: value });
      toast.success(value > 0 ? "Added to your goal" : "Removed from your goal");
      setOpen(false);
      setAmount("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update goal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" />
          Add money
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to {goal.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-add">Amount</Label>
          <Input id="goal-add" type="number" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_BAR: Record<GoalProgress["status"], string> = {
  complete: "bg-moss",
  "on-track": "bg-champagne",
  behind: "bg-oxblood",
  "no-date": "bg-champagne",
};

function GoalCard({ goal, accounts, currency }: { goal: GoalRow; accounts: AccountChoice[]; currency: string }) {
  const router = useRouter();

  async function handleDelete() {
    try {
      await send(`/api/goals/${goal.id}`, "DELETE");
      toast.success("Goal removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete goal");
    }
  }

  const dateLabel = goal.targetDate
    ? new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-base font-medium">{goal.name}</p>
            <p className="text-xs text-muted-foreground">
              {goal.tracksAccount ? "Following an account balance" : "Tracked by hand"}
              {dateLabel ? ` · by ${dateLabel}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!goal.tracksAccount && goal.status !== "complete" && <AddMoneyDialog goal={goal} />}
            <GoalDialog
              goal={goal}
              accounts={accounts}
              trigger={
                <Button size="icon" variant="ghost" aria-label={`Edit ${goal.name}`}>
                  <Pencil className="size-3.5" />
                </Button>
              }
            />
            <Button size="icon" variant="ghost" aria-label={`Delete ${goal.name}`} onClick={handleDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <p className="font-mono text-2xl font-semibold tabular-nums">{formatCurrency(goal.saved, currency)}</p>
          <p className="text-sm text-muted-foreground">of {formatCurrency(goal.target, currency)}</p>
        </div>
        <div
          role="progressbar"
          aria-label={`${goal.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(goal.percent * 100)}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full", STATUS_BAR[goal.status])} style={{ width: `${goal.percent * 100}%` }} />
        </div>

        <p className="text-sm text-muted-foreground">
          {goal.status === "complete" && <span className="text-moss">Goal reached.</span>}
          {goal.status === "on-track" && goal.neededPerMonth !== null && (
            <>
              Set aside <span className="text-foreground">{formatCurrency(goal.neededPerMonth, currency)}</span> a month for{" "}
              {goal.monthsLeft} month{goal.monthsLeft === 1 ? "" : "s"} to get there.
            </>
          )}
          {goal.status === "behind" && (
            <span className="text-oxblood-text">
              The target date has passed with {formatCurrency(goal.remaining, currency)} to go. Edit the date to set a new one.
            </span>
          )}
          {goal.status === "no-date" && <>{formatCurrency(goal.remaining, currency)} to go. Add a target date to see a monthly amount.</>}
        </p>
      </CardContent>
    </Card>
  );
}

export function GoalsManager({
  goals,
  accounts,
  currency,
}: {
  goals: GoalRow[];
  accounts: AccountChoice[];
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <GoalDialog
          accounts={accounts}
          trigger={
            <Button size="sm" variant="outline">
              <Plus className="size-3.5" />
              New goal
            </Button>
          }
        />
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <PiggyBank className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              No savings goals yet. Add one to see how much to set aside each month.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} accounts={accounts} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}
