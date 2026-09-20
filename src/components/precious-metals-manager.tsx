"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Coins, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Money } from "@/components/money";
import { RefreshMetalPricesButton } from "@/components/refresh-metal-prices-button";
import { holdingValue, isPriceStale } from "@/lib/precious-metals";

export type PreciousMetalHolding = {
  id: string;
  metal: "gold" | "silver";
  weight: number;
  weight_unit: "oz" | "g";
  purity: number;
  notes: string | null;
};

export type MetalPriceRow = {
  metal: "gold" | "silver";
  price_per_troy_oz_usd: number;
  fetched_at: string;
};

const METAL_LABEL: Record<PreciousMetalHolding["metal"], string> = {
  gold: "Gold",
  silver: "Silver",
};

// "troy oz", never bare "oz", to avoid confusion with the regular
// (avoirdupois) ounce — precious metals are always weighed in troy units.
const UNIT_LABEL: Record<PreciousMetalHolding["weight_unit"], string> = {
  oz: "troy oz",
  g: "g",
};

// Standard karat-to-fineness conversions for gold — lets the user pick a
// karat instead of having to know/look up the decimal purity themselves.
// Silver doesn't use karat (it's quoted directly as a fineness, e.g.
// "sterling" = .925), so this only applies when metal === "gold".
const KARAT_OPTIONS: { key: string; label: string; purity: number }[] = [
  { key: "24k", label: "24k (fine gold)", purity: 1 },
  { key: "22k", label: "22k", purity: 0.9167 },
  { key: "21k", label: "21k", purity: 0.875 },
  { key: "18k", label: "18k", purity: 0.75 },
  { key: "14k", label: "14k", purity: 0.5833 },
  { key: "10k", label: "10k", purity: 0.4167 },
];

function karatForPurity(purity: number): string {
  const match = KARAT_OPTIONS.find((k) => Math.abs(k.purity - purity) < 0.0005);
  return match?.key ?? "other";
}

type FormState = {
  metal: PreciousMetalHolding["metal"];
  weight: string;
  weight_unit: PreciousMetalHolding["weight_unit"];
  karat: string;
  purity: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  metal: "gold",
  weight: "",
  weight_unit: "oz",
  karat: "24k",
  purity: "1",
  notes: "",
};

function HoldingDialog({
  holding,
  trigger,
}: {
  holding?: PreciousMetalHolding;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(holding && holding.purity !== 1));
  const [form, setForm] = useState<FormState>(
    holding
      ? {
          metal: holding.metal,
          weight: String(holding.weight),
          weight_unit: holding.weight_unit,
          karat: holding.metal === "gold" ? karatForPurity(holding.purity) : "24k",
          purity: String(holding.purity),
          notes: holding.notes ?? "",
        }
      : EMPTY_FORM
  );

  async function handleSave() {
    const weight = Number(form.weight);
    const purity = Number(form.purity || "1");
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error("Enter a weight greater than 0");
      return;
    }
    if (!Number.isFinite(purity) || purity <= 0 || purity > 1) {
      toast.error("Purity must be between 0 and 1 (e.g. 0.999)");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        metal: form.metal,
        weight,
        weight_unit: form.weight_unit,
        purity,
        notes: form.notes.trim() || null,
      };

      const res = holding
        ? await fetch(`/api/precious-metals/${holding.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/precious-metals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save holding");
      }

      toast.success(holding ? "Holding updated" : "Holding added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save holding");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{holding ? "Edit holding" : "Add precious metal holding"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Metal</Label>
            <Select
              value={form.metal}
              onValueChange={(v) => setForm((f) => ({ ...f, metal: v as PreciousMetalHolding["metal"] }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="silver">Silver</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="metal-weight">Weight</Label>
              <Input
                id="metal-weight"
                type="number"
                step="0.0001"
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Unit</Label>
              <Select
                value={form.weight_unit}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, weight_unit: v as PreciousMetalHolding["weight_unit"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oz">Troy oz</SelectItem>
                  <SelectItem value="g">Grams</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={`size-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            Advanced: purity
          </button>

          {showAdvanced ? (
            <div className="flex flex-col gap-3">
              {form.metal === "gold" && (
                <div className="flex flex-col gap-1.5">
                  <Label>Karat</Label>
                  <Select
                    value={form.karat}
                    onValueChange={(v) => {
                      const option = KARAT_OPTIONS.find((k) => k.key === v);
                      setForm((f) => ({
                        ...f,
                        karat: v,
                        purity: option ? String(option.purity) : f.purity,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KARAT_OPTIONS.map((k) => (
                        <SelectItem key={k.key} value={k.key}>
                          {k.label} ({k.purity})
                        </SelectItem>
                      ))}
                      <SelectItem value="other">Other (enter purity manually)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(form.metal !== "gold" || form.karat === "other") && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="metal-purity">Purity (0–1, e.g. 0.999)</Label>
                  <Input
                    id="metal-purity"
                    type="number"
                    step="0.001"
                    min="0"
                    max="1"
                    value={form.purity}
                    onChange={(e) => setForm((f) => ({ ...f, purity: e.target.value }))}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Assumes fine/pure metal (purity 1.0) unless specified above.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metal-notes">Notes (optional)</Label>
            <Input
              id="metal-notes"
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

function HoldingRow({
  holding,
  price,
}: {
  holding: PreciousMetalHolding;
  price: MetalPriceRow | undefined;
}) {
  const router = useRouter();
  const value = holdingValue(
    holding.weight,
    holding.weight_unit,
    holding.purity,
    price?.price_per_troy_oz_usd ?? null
  );
  const stale = isPriceStale(price?.fetched_at ?? null);

  async function handleDelete() {
    try {
      const res = await fetch(`/api/precious-metals/${holding.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete holding");
      }
      toast.success("Holding removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete holding");
    }
  }

  return (
    <div className="flex items-center justify-between border-t border-border py-3 transition-colors duration-150 first:border-t-0 first:pt-0 hover:bg-muted/40">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-champagne">
          <Coins className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">
            {METAL_LABEL[holding.metal]} · {holding.weight} {UNIT_LABEL[holding.weight_unit]}
            {holding.purity !== 1 ? ` · ${(holding.purity * 100).toFixed(1)}% purity` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {price ? (
              <>
                spot price: ${price.price_per_troy_oz_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}/oz
                {stale ? (
                  <span className="text-oxblood">
                    {" "}
                    · as of {new Date(price.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} (stale)
                  </span>
                ) : (
                  <> · as of {new Date(price.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                )}
              </>
            ) : (
              "no price fetched yet"
            )}
            {holding.notes ? ` · ${holding.notes}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {value === null ? (
          <span className="font-mono text-sm text-muted-foreground">—</span>
        ) : (
          <Money amount={value} tone="positive" className="text-sm font-medium" />
        )}
        <HoldingDialog
          holding={holding}
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
    </div>
  );
}

export function PreciousMetalsManager({
  holdings,
  prices,
}: {
  holdings: PreciousMetalHolding[];
  prices: MetalPriceRow[];
}) {
  const priceByMetal = new Map(prices.map((p) => [p.metal, p]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-[0.08em] text-ash-grey uppercase">
          Precious metals
        </h3>
        <div className="flex items-center gap-2">
          <RefreshMetalPricesButton />
          <HoldingDialog
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="size-3.5" />
                Add holding
              </Button>
            }
          />
        </div>
      </div>

      {holdings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No precious metal holdings yet. Add gold or silver to include it in net worth.
        </p>
      ) : (
        <div className="flex flex-col">
          {holdings.map((h) => (
            <HoldingRow key={h.id} holding={h} price={priceByMetal.get(h.metal)} />
          ))}
        </div>
      )}
    </div>
  );
}
