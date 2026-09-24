"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaidBackField, initialPaidBack, paidBackToSave, savePaidBack } from "@/components/paid-back-field";
import { ALL_PFC_CATEGORIES, humanizeCategory } from "@/lib/plaid-categories";

const PLAID_DEFAULT = "__plaid_default__";

export type EditableTransaction = {
  id: string;
  // What the row shows right now (after any edits) and what Plaid sent.
  displayName: string;
  originalDisplayName: string;
  // Raw text a rule would match on: the merchant name if Plaid gave one,
  // otherwise the cleaned display name.
  ruleSeed: string;
  // The category currently in effect, and the user's own pick (if any).
  categoryOverride: string | null;
  notes: string | null;
  edited: boolean;
  // The charge (money out positive) and how much of it was paid back.
  amount: number;
  paidBack: number | null;
};

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

/**
 * Rename, recategorize, note or mark paid back a bank transaction, and
 * optionally make the name and category a rule for every matching one.
 * Mounted fresh for each transaction, so its fields start from the row.
 */
export function EditTransactionForm({ transaction, onDone }: { transaction: EditableTransaction; onDone: () => void }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(transaction.displayName === transaction.originalDisplayName ? "" : transaction.displayName);
  const [category, setCategory] = useState(transaction.categoryOverride ?? PLAID_DEFAULT);
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [applyToAll, setApplyToAll] = useState(false);
  const [matchText, setMatchText] = useState(transaction.ruleSeed);
  const [paidBack, setPaidBack] = useState(() => initialPaidBack(transaction.paidBack));

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    const newName = name.trim();
    const newCategory = category === PLAID_DEFAULT ? null : category;
    const rule = applyToAll ? { match_text: matchText.trim(), rename_to: newName || null, category: newCategory } : null;

    if (rule && rule.match_text.length < 2) {
      toast.error("Enter at least 2 characters to match on");
      return;
    }
    if (rule && !rule.rename_to && !rule.category) {
      toast.error("Set a new name or category for the rule to apply");
      return;
    }
    const paid = paidBackToSave(paidBack, transaction.amount);
    if ("error" in paid) {
      toast.error(paid.error);
      return;
    }

    setIsSaving(true);
    try {
      // With a rule, the name/category live on the rule (so they follow
      // every matching transaction) and this transaction keeps only its
      // own note; without one, all three are just this transaction's.
      await send(`/api/transactions/${transaction.id}/override`, "PUT", {
        category: rule ? null : newCategory,
        merchant_name: rule ? null : newName || null,
        notes: notes.trim() || null,
      });
      if (rule) await send("/api/merchant-rules", "POST", rule);
      if (paid.amount !== (transaction.paidBack ?? null)) await savePaidBack(transaction.id, false, paid.amount);

      toast.success(rule ? "Saved and applied to matching transactions" : "Transaction updated");
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    setIsSaving(true);
    try {
      await send(`/api/transactions/${transaction.id}/override`, "DELETE");
      toast.success("Reset to the original");
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset transaction");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-tx-name">Name</Label>
        <Input id="edit-tx-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={transaction.originalDisplayName} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLAID_DEFAULT}>Use the bank&apos;s category</SelectItem>
            {ALL_PFC_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {humanizeCategory(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-tx-notes">Notes (optional)</Label>
        <Input id="edit-tx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {transaction.amount > 0 && (
        <PaidBackField id={`paid-back-${transaction.id}`} charge={transaction.amount} value={paidBack} onChange={setPaidBack} />
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="size-4 accent-[var(--champagne)]"
          />
          Apply the name/category to every matching transaction, past and future
        </label>
        {applyToAll && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-tx-match">When the merchant contains</Label>
            <Input id="edit-tx-match" value={matchText} onChange={(e) => setMatchText(e.target.value)} />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Original: {transaction.originalDisplayName}. Your changes never touch the bank data.</p>

      <div className="flex items-center justify-end gap-2">
        {transaction.edited && (
          <Button type="button" variant="ghost" onClick={handleReset} disabled={isSaving}>
            Reset this transaction
          </Button>
        )}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
