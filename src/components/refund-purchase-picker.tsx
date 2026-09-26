"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { NO_PURCHASE, purchasesForRefund, type RefundDating } from "@/lib/refunds";
import type { SpendingTransaction } from "@/lib/spending-aggregation";
import { humanizeTransactionName } from "@/lib/transaction-display";

type Row = SpendingTransaction &
  RefundDating & {
    id: string;
    account: { id: string } | null;
    original_merchant_name?: string | null;
    iso_currency_code: string | null;
  };

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Which purchase a refund gives money back for. It's found on its own
 * when it can be; here it can be picked, or set to none so it counts on
 * the day it came back. Keyed by what's saved, so it starts over once a
 * change comes back.
 */
export function RefundPurchasePicker({ refund, transactions }: { refund: Row; transactions: Row[] }) {
  const router = useRouter();
  const [value, setValue] = useState(refund.refund_for?.purchaseId ?? NO_PURCHASE);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => {
    const list = purchasesForRefund(refund, transactions);
    // One you picked on another account still shows.
    const linked = refund.refund_for && !list.some((p) => p.id === refund.refund_for!.purchaseId) ? transactions.find((p) => p.id === refund.refund_for!.purchaseId) : undefined;
    return linked ? [linked, ...list] : list;
  }, [refund, transactions]);

  async function save(purchase: string | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${refund.id}/refund`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save");
      toast.success(data.message ?? "Saved");
      router.refresh();
    } catch (err) {
      setValue(refund.refund_for?.purchaseId ?? NO_PURCHASE);
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const link = refund.refund_for;
  const chosen = Boolean(link?.chosen || refund.refund_kept);
  const note = link
    ? link.chosen
      ? "You picked this purchase."
      : `Found on its own: the same store, on the same account${link.partial ? "" : ", for the same amount"}.`
    : refund.refund_kept
      ? "You said it's for no purchase, so it counts when it came back."
      : options.length > 0
        ? "No purchase matched for certain. Pick one to count it in that purchase's month."
        : "No purchase on this account in the 4 months before it came back.";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Refund</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`refund-for-${refund.id}`}>Which purchase it&apos;s for</Label>
        <Select
          value={value}
          disabled={saving}
          onValueChange={(next) => {
            if (next === value) return;
            setValue(next);
            void save(next);
          }}
        >
          <SelectTrigger id={`refund-for-${refund.id}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {humanizeTransactionName(p)} · {formatCurrency(p.amount, p.iso_currency_code)} · {day(p.date)}
              </SelectItem>
            ))}
            <SelectItem value={NO_PURCHASE}>None: count it when it came back</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {note}
          {chosen && (
            <>
              {" "}
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
                className="text-champagne underline-offset-4 hover:underline disabled:opacity-50"
              >
                Let it be matched on its own
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
