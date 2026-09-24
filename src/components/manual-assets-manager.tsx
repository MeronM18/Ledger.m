"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Diff, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Money } from "@/components/money";
import { Ago } from "@/components/accounts-board";
import { AssetRow, AssetSectionHeader } from "@/components/asset-row";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { adjustedCash, type CashDirection } from "@/lib/cash-adjust";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ManualAsset = {
  id: string;
  name: string;
  category: "cash" | "crypto" | "vehicle" | "property" | "other";
  value: number;
  is_liability: boolean;
  notes: string | null;
  updated_at?: string | null;
};

const CATEGORY_LABEL: Record<ManualAsset["category"], string> = {
  cash: "Cash",
  crypto: "Crypto",
  vehicle: "Vehicle",
  property: "Property",
  other: "Other",
};

type FormState = {
  name: string;
  category: ManualAsset["category"];
  value: string;
  is_liability: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  category: "cash",
  value: "",
  is_liability: false,
  notes: "",
};

/**
 * Cash only: add to it or take from it ("spent $40", "got $200 back")
 * instead of retyping the total. Shows the new balance before saving.
 */
function AdjustCashButton({ asset }: { asset: ManualAsset }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<CashDirection>("add");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const result = amount.trim() === "" ? null : adjustedCash(asset.value, direction, Number(amount));

  function handleOpenChange(next: boolean) {
    if (next) {
      setDirection("add");
      setAmount("");
    }
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!result || "error" in result) {
      toast.error(result && "error" in result ? result.error : "Enter an amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/manual-assets/${asset.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, amount: Number(amount) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update the balance");
      toast.success(
        `${direction === "add" ? "Added" : "Took"} ${formatCurrency(Number(amount), "USD")} ${direction === "add" ? "to" : "from"} ${asset.name}. Now ${formatCurrency(data.value, "USD")}.`
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update the balance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Add to or take from ${asset.name}`} title="Add or subtract">
          <Diff className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Update {asset.name}</DialogTitle>
            <DialogDescription>
              Now <span className="font-mono tabular-nums">{formatCurrency(asset.value, "USD")}</span>. Add to it or take from it.
            </DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="Add or subtract" className="grid grid-cols-2 gap-1 rounded-md border border-border p-0.5">
            {(["add", "subtract"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={direction === d}
                onClick={() => setDirection(d)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-[5px] py-1.5 text-sm transition-colors",
                  direction === d ? "bg-bone/12 text-bone ring-1 ring-bone/10 ring-inset hover:bg-bone/16" : "text-muted-foreground hover:bg-bone/6 hover:text-bone"
                )}
              >
                {d === "add" ? <Plus className="size-3.5 shrink-0" aria-hidden /> : <Minus className="size-3.5 shrink-0" aria-hidden />}
                {d === "add" ? "Add" : "Subtract"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cash-amount-${asset.id}`}>Amount</Label>
            <Input
              id={`cash-amount-${asset.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              autoFocus
              className="no-spinner"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <p className="min-h-5 text-sm" aria-live="polite">
            {result && "value" in result ? (
              <>
                <span className="font-mono text-muted-foreground tabular-nums">{formatCurrency(asset.value, "USD")}</span>
                <span className="text-muted-foreground"> → </span>
                <span className={cn("font-mono tabular-nums", direction === "add" ? "text-moss" : "text-oxblood-text")}>
                  {formatCurrency(result.value, "USD")}
                </span>
              </>
            ) : result ? (
              <span className="text-oxblood-text">{result.error}</span>
            ) : null}
          </p>

          <DialogFooter>
            <Button type="submit" disabled={saving || !result || "error" in result}>
              {saving ? "Saving..." : direction === "add" ? "Add" : "Subtract"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ManualAssetsManager({ assets }: { assets: ManualAsset[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(asset: ManualAsset) {
    setEditingId(asset.id);
    setForm({
      name: asset.name,
      category: asset.category,
      value: String(asset.value),
      is_liability: asset.is_liability,
      notes: asset.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    const value = Number(form.value);
    if (!form.name.trim() || Number.isNaN(value)) {
      toast.error("Enter a name and a numeric value");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        value,
        is_liability: form.is_liability,
        notes: form.notes.trim() || null,
      };

      const res = editingId
        ? await fetch(`/api/manual-assets/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/manual-assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save asset");
      }

      toast.success(editingId ? "Asset updated" : "Asset added");
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save asset");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/manual-assets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete asset");
      }
      toast.success("Asset removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete asset");
    }
  }

  // What they add up to: assets less anything owed.
  const net = assets.reduce((s, a) => s + (a.is_liability ? -a.value : a.value), 0);

  return (
    <div>
      <AssetSectionHeader title="Cash and property" total={formatCurrency(net, "USD")}>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="xs" variant="ghost" className="text-champagne hover:text-champagne" onClick={openCreate}>
              <Plus />
              Add asset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit asset" : "Add manual asset"}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asset-name">Name</Label>
                <Input
                  id="asset-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. 2021 Honda Civic"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as ManualAsset["category"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asset-value">Value</Label>
                <Input
                  id="asset-value"
                  type="number"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="asset-liability">This is a liability (a debt, not an asset)</Label>
                <Switch
                  id="asset-liability"
                  checked={form.is_liability}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, is_liability: checked }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asset-notes">Notes (optional)</Label>
                <Input
                  id="asset-notes"
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
      </AssetSectionHeader>

      {assets.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Nothing yet. Add cash on hand, a car, property, crypto, or a debt outside a bank.
        </p>
      ) : (
        <ul>
          {assets.map((asset) => (
            <AssetRow
              key={asset.id}
              mark={<InstitutionAvatar icon={asset.category} />}
              name={asset.name}
              detail={[CATEGORY_LABEL[asset.category], asset.is_liability ? "Owed" : null, asset.notes].filter(Boolean).join(" · ")}
              value={
                <Money
                  amount={asset.is_liability ? -asset.value : asset.value}
                  tone={asset.is_liability ? "negative" : "neutral"}
                  className="text-sm font-medium"
                />
              }
              note={asset.updated_at ? <Ago prefix="Updated" at={asset.updated_at} /> : "Entered by you"}
              actions={
                <>
                  {asset.category === "cash" && !asset.is_liability && <AdjustCashButton asset={asset} />}
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${asset.name}`} onClick={() => openEdit(asset)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${asset.name}`} onClick={() => handleDelete(asset.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
