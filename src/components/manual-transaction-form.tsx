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
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_PFC_CATEGORIES, humanizeCategory } from "@/lib/plaid-categories";

export type ManualTransaction = {
  id: string;
  date: string;
  name: string;
  amount: number; // Plaid convention: positive = money out, negative = money in
  pfc_primary: (typeof ALL_PFC_CATEGORIES)[number];
  payment_method: string | null;
  notes: string | null;
};

type FormState = {
  date: string;
  name: string;
  amount: string;
  direction: "out" | "in";
  pfc_primary: (typeof ALL_PFC_CATEGORIES)[number];
  payment_method: string;
  notes: string;
};

// NOT new Date().toISOString().slice(0, 10) — that converts to UTC first,
// so anyone west of UTC using this after ~8pm local (America/New_York
// during EDT) gets tomorrow's date instead of today's. Confirmed live: at
// 11:21pm EDT, toISOString() already reads 2026-09-20 while it's still
// 2026-09-19 locally. en-CA formats as YYYY-MM-DD, matching what an
// <input type="date"> value expects. Same timezone convention as
// greeting-header.tsx, for the same reason (this app has one real user, in
// one real place).
function todayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

const EMPTY_FORM: FormState = {
  date: todayIsoDate(),
  name: "",
  amount: "",
  direction: "out",
  pfc_primary: "GENERAL_MERCHANDISE",
  payment_method: "",
  notes: "",
};

function ManualTransactionDialog({
  transaction,
  trigger,
}: {
  transaction?: ManualTransaction;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(
    transaction
      ? {
          date: transaction.date,
          name: transaction.name,
          amount: String(Math.abs(transaction.amount)),
          direction: transaction.amount >= 0 ? "out" : "in",
          pfc_primary: transaction.pfc_primary,
          payment_method: transaction.payment_method ?? "",
          notes: transaction.notes ?? "",
        }
      : EMPTY_FORM
  );

  async function handleSave() {
    const magnitude = Number(form.amount);
    if (!form.name.trim() || !Number.isFinite(magnitude) || magnitude <= 0) {
      toast.error("Enter a name and an amount greater than 0");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        date: form.date,
        name: form.name.trim(),
        amount: form.direction === "out" ? magnitude : -magnitude,
        pfc_primary: form.pfc_primary,
        payment_method: form.payment_method.trim() || null,
        notes: form.notes.trim() || null,
      };

      const res = transaction
        ? await fetch(`/api/manual-transactions/${transaction.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/manual-transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save transaction");
      }

      toast.success(transaction ? "Transaction updated" : "Transaction added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "Add transaction"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-name">Name / merchant</Label>
            <Input
              id="tx-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Farmers Market"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Direction</Label>
            {/* A segmented toggle, not two independent buttons: one shared
                border draws the outer boundary, divide-x draws the seam
                between segments, and the active side is a solid champagne
                fill (same bg-primary/text-primary-foreground pairing used
                for primary actions elsewhere) so selected vs. unselected is
                unambiguous against the dark theme. */}
            <div className="flex divide-x divide-border overflow-hidden rounded-lg border border-border">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "flex-1 rounded-none",
                  form.direction === "out"
                    ? "bg-primary text-primary-foreground hover:bg-primary/80"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setForm((f) => ({ ...f, direction: "out" }))}
              >
                Money out
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "flex-1 rounded-none",
                  form.direction === "in"
                    ? "bg-primary text-primary-foreground hover:bg-primary/80"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setForm((f) => ({ ...f, direction: "in" }))}
              >
                Money in
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select
              value={form.pfc_primary}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, pfc_primary: v as (typeof ALL_PFC_CATEGORIES)[number] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_PFC_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {humanizeCategory(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-payment-method">Payment method (optional)</Label>
            <Input
              id="tx-payment-method"
              value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
              placeholder="e.g. Cash, Check"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-notes">Notes (optional)</Label>
            <Input
              id="tx-notes"
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

export function AddManualTransactionButton() {
  return (
    <ManualTransactionDialog
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" />
          Add transaction
        </Button>
      }
    />
  );
}

export function ManualTransactionRowActions({ transaction }: { transaction: ManualTransaction }) {
  const router = useRouter();

  async function handleDelete() {
    try {
      const res = await fetch(`/api/manual-transactions/${transaction.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete transaction");
      }
      toast.success("Transaction removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete transaction");
    }
  }

  return (
    <div className="flex items-center gap-1">
      <ManualTransactionDialog
        transaction={transaction}
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
