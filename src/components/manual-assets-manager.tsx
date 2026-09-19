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
import { Money } from "@/components/money";

export type ManualAsset = {
  id: string;
  name: string;
  category: "cash" | "crypto" | "vehicle" | "property" | "other";
  value: number;
  is_liability: boolean;
  notes: string | null;
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-[0.08em] text-ash-grey uppercase">
          Manual entries
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="size-3.5" />
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
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No manual entries yet. Add cash, crypto, vehicles, property, or other assets/liabilities.
        </p>
      ) : (
        <div className="flex flex-col">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between border-t py-3 transition-colors duration-150 first:border-t-0 first:pt-0 hover:bg-muted/40"
            >
              <div>
                <p className="text-sm font-medium">{asset.name}</p>
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_LABEL[asset.category]} · {asset.is_liability ? "Liability" : "Asset"}
                  {asset.notes ? ` · ${asset.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Money
                  amount={asset.value}
                  tone={asset.is_liability ? "negative" : "positive"}
                  className="text-sm font-medium"
                />
                <Button size="icon" variant="ghost" onClick={() => openEdit(asset)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(asset.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
