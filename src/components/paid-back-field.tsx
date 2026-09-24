"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";

/** The form value: off, or on with the amount as typed. */
export type PaidBackValue = { on: boolean; amount: string };

export function initialPaidBack(paidBack: number | null | undefined): PaidBackValue {
  return paidBack ? { on: true, amount: String(paidBack) } : { on: false, amount: "" };
}

/** The amount to save (null to clear), or an error message. */
export function paidBackToSave(value: PaidBackValue, charge: number): { amount: number | null } | { error: string } {
  if (!value.on) return { amount: null };
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter how much you were paid back" };
  if (amount > charge + 0.005) return { error: `That's more than the charge of ${formatCurrency(charge, "USD")}` };
  return { amount: Math.round(amount * 100) / 100 };
}

/**
 * "Someone paid me back in cash" for a charge you covered for them: only
 * your share then counts as spending. Your cash on the Assets page is left
 * alone, since what you were handed is up to you to track.
 */
export function PaidBackField({
  id,
  charge,
  value,
  onChange,
}: {
  id: string;
  charge: number;
  value: PaidBackValue;
  onChange: (next: PaidBackValue) => void;
}) {
  const amount = Number(value.amount);
  const share = value.on && Number.isFinite(amount) && amount > 0 ? Math.max(0, charge - amount) : charge;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.on}
          onChange={(e) => onChange({ on: e.target.checked, amount: value.amount || String(charge) })}
          className="size-4 accent-[var(--champagne)]"
        />
        Someone paid me back in cash for this
      </label>
      {value.on && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Amount paid back</Label>
          <div className="flex items-center gap-2">
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={value.amount}
              onChange={(e) => onChange({ on: true, amount: e.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange({ on: true, amount: String(charge) })}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-bone"
            >
              All of it
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {share > 0
              ? `Your share, ${formatCurrency(share, "USD")}, is what counts as spending.`
              : "None of it counts as your spending."}{" "}
            Your cash on the Assets page doesn&apos;t change.
          </p>
        </div>
      )}
    </div>
  );
}

export async function savePaidBack(id: string, manual: boolean, amount: number | null) {
  const res = await fetch(`/api/transactions/${id}/paid-back`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, manual }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Couldn't save the paid-back amount");
  }
}
