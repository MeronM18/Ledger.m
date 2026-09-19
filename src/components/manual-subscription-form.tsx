"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { humanizeFrequency } from "@/lib/plaid-categories";

export type ManualSubscription = {
  id: string;
  name: string;
  amount: number;
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | "ANNUALLY";
  next_billing_date: string | null;
  notes: string | null;
  is_active: boolean;
};

const FREQUENCIES: ManualSubscription["frequency"][] = [
  "WEEKLY",
  "BIWEEKLY",
  "SEMI_MONTHLY",
  "MONTHLY",
  "ANNUALLY",
];

type FormState = {
  name: string;
  amount: string;
  frequency: ManualSubscription["frequency"];
  next_billing_date: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  amount: "",
  frequency: "MONTHLY",
  next_billing_date: "",
  notes: "",
};

function ManualSubscriptionDialog({
  subscription,
  trigger,
}: {
  subscription?: ManualSubscription;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(
    subscription
      ? {
          name: subscription.name,
          amount: String(subscription.amount),
          frequency: subscription.frequency,
          next_billing_date: subscription.next_billing_date ?? "",
          notes: subscription.notes ?? "",
        }
      : EMPTY_FORM
  );

  async function handleSave() {
    const amount = Number(form.amount);
    if (!form.name.trim() || Number.isNaN(amount)) {
      toast.error("Enter a name and a numeric amount");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount,
        frequency: form.frequency,
        next_billing_date: form.next_billing_date || null,
        notes: form.notes.trim() || null,
      };

      const res = subscription
        ? await fetch(`/api/manual-subscriptions/${subscription.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/manual-subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save subscription");
      }

      toast.success(subscription ? "Subscription updated" : "Subscription added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save subscription");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{subscription ? "Edit subscription" : "Add manual subscription"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-name">Name</Label>
            <Input
              id="sub-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Apple One"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-amount">Amount</Label>
            <Input
              id="sub-amount"
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Frequency</Label>
            <Select
              value={form.frequency}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, frequency: v as ManualSubscription["frequency"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {humanizeFrequency(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-next-date">Next billing date (optional)</Label>
            <Input
              id="sub-next-date"
              type="date"
              value={form.next_billing_date}
              onChange={(e) => setForm((f) => ({ ...f, next_billing_date: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-notes">Notes (optional)</Label>
            <Input
              id="sub-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddManualSubscriptionButton() {
  return (
    <ManualSubscriptionDialog
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" />
          Add subscription
        </Button>
      }
    />
  );
}

export function ManualSubscriptionRowActions({ subscription }: { subscription: ManualSubscription }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function handleCancelToggle(checked: boolean) {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/manual-subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !checked }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update subscription");
      }
      toast.success(checked ? "Marked as cancelled" : "Marked as active again");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/manual-subscriptions/${subscription.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete subscription");
      }
      toast.success("Subscription removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete subscription");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {!subscription.is_active ? "Cancelled" : "Mark cancelled"}
        </span>
        <Switch checked={!subscription.is_active} disabled={isSaving} onCheckedChange={handleCancelToggle} />
      </div>
      <ManualSubscriptionDialog
        subscription={subscription}
        trigger={
          <Button size="icon" variant="ghost">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button size="icon" variant="ghost" onClick={handleDelete}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
