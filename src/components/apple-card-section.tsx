"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Money } from "@/components/money";
import { formatCurrency } from "@/lib/format";

export type AppleCard = {
  id: string;
  type: "credit" | "depository";
  name: string;
  balance: number;
  balanceKnown: boolean;
  earned: number;
  creditLimit: number | null;
  hasBalanceOverride: boolean;
  balanceOverride: number | null;
  transactionCount: number;
  lastTransactionDate: string | null;
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

function ImportDialog({ hasSavings, trigger }: { hasSavings: boolean; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<{ name: string; text: string; kind: "card" | "savings" | null } | null>(null);
  const [limit, setLimit] = useState("");
  const [balance, setBalance] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) {
      setFile(null);
      setLimit("");
      setBalance("");
    }
    setOpen(next);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const text = await picked.text();
    // The header row tells the two Apple exports apart.
    const header = text.split(/\r?\n/, 1)[0] ?? "";
    const kind = header.includes("Activity Type") ? "savings" : header.includes("Amount (USD)") ? "card" : null;
    setFile({ name: picked.name, text, kind });
  }

  async function handleImport() {
    if (!file || !file.kind) {
      toast.error("Choose an Apple Card or Apple Savings CSV first");
      return;
    }
    const limitValue = limit === "" ? undefined : Number(limit);
    const balanceValue = balance === "" ? undefined : Number(balance);
    if (file.kind === "card" && limitValue !== undefined && !(limitValue > 0)) {
      toast.error("Enter the credit limit as a number above 0, or leave it blank");
      return;
    }
    if (file.kind === "savings" && balanceValue === undefined && !hasSavings) {
      toast.error("Enter your Apple Savings balance from Wallet");
      return;
    }
    if (file.kind === "savings" && balanceValue !== undefined && !(balanceValue >= 0)) {
      toast.error("Enter the balance as a number");
      return;
    }
    setSaving(true);
    try {
      const result = await send("/api/import/apple-card", "POST", {
        csv: file.text,
        ...(file.kind === "card" && limitValue !== undefined ? { credit_limit: limitValue } : {}),
        ...(file.kind === "savings" && balanceValue !== undefined ? { balance: balanceValue } : {}),
      });
      toast.success(
        result.added === 0
          ? "Nothing new: every transaction in that file was already imported"
          : `Imported ${result.added} transaction${result.added === 1 ? "" : "s"}${
              result.alreadyThere > 0 ? ` (${result.alreadyThere} already there)` : ""
            }`
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import an Apple statement</DialogTitle>
          <DialogDescription>
            In Wallet, open Apple Card, choose Statements (or Savings) and export the transactions as CSV. It works for
            both Apple Card and Apple Savings, and anything already imported is skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-csv">CSV file</Label>
            <Input id="apple-csv" type="file" accept=".csv,text/csv" onChange={handleFile} />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.kind === "card" ? "Apple Card export: " : file.kind === "savings" ? "Apple Savings export: " : "Not recognized: "}
                {file.name}
              </p>
            )}
          </div>
          {file?.kind === "card" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apple-limit">Credit limit (optional)</Label>
              <Input id="apple-limit" type="number" min="0" step="100" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="e.g. 5000" />
              <p className="text-xs text-muted-foreground">Shown in your credit utilization. Find it in Wallet under Apple Card.</p>
            </div>
          )}
          {file?.kind === "savings" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apple-balance">Balance today{hasSavings ? " (optional)" : ""}</Label>
              <Input id="apple-balance" type="number" min="0" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="e.g. 334.38" />
              <p className="text-xs text-muted-foreground">The export lists deposits but not your balance. Copy it from Wallet.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleImport} disabled={saving || !file?.kind}>
            {saving ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ card }: { card: AppleCard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState("");
  const [balance, setBalance] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) {
      setLimit(card.creditLimit ? String(card.creditLimit) : "");
      setBalance(card.balanceOverride !== null ? String(card.balanceOverride) : "");
    }
    setOpen(next);
  }

  async function handleSave() {
    const limitValue = limit === "" ? null : Number(limit);
    const balanceValue = balance === "" ? null : Number(balance);
    if ((limitValue !== null && !(limitValue > 0)) || (balanceValue !== null && !Number.isFinite(balanceValue)) || (card.type === "depository" && balanceValue === null)) {
      toast.error("Enter valid numbers, or leave a field blank");
      return;
    }
    setSaving(true);
    try {
      await send(`/api/manual-accounts/${card.id}`, "PATCH", {
        ...(card.type === "credit" ? { credit_limit: limitValue } : {}),
        balance_override: balanceValue,
      });
      toast.success(`${card.name} updated`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Edit ${card.name}`}>
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {card.name}</DialogTitle>
          <DialogDescription>
            {card.type === "credit"
              ? "The balance is worked out from your imported transactions. If it doesn't match Wallet (for example, your statements don't go back to the day you opened the card), type the real balance here."
              : "Type your balance from Wallet. The export lists deposits but not the balance, so keep this up to date when you check in."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {card.type === "credit" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apple-edit-limit">Credit limit</Label>
              <Input id="apple-edit-limit" type="number" min="0" step="100" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-edit-balance">{card.type === "credit" ? "Current balance (optional)" : "Balance"}</Label>
            <Input
              id="apple-edit-balance"
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="Leave blank to use the imported transactions"
            />
          </div>
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

function DeleteButton({ card }: { card: AppleCard }) {
  const router = useRouter();

  async function handleDelete() {
    if (!window.confirm(`Remove ${card.name} and all ${card.transactionCount} imported transactions? This can't be undone.`)) return;
    try {
      await send(`/api/manual-accounts/${card.id}`, "DELETE");
      toast.success(`${card.name} removed`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <Button size="icon" variant="ghost" aria-label={`Remove ${card.name}`} onClick={handleDelete}>
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function AppleCardSection({ cards }: { cards: AppleCard[] }) {
  const hasSavings = cards.some((c) => c.type === "depository");
  const importButton = (
    <ImportDialog
      hasSavings={hasSavings}
      trigger={
        <Button size="sm" variant="outline">
          <FileUp className="size-3.5" />
          Import statement
        </Button>
      }
    />
  );

  if (cards.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Apple Card and Apple Savings</CardTitle>
          {importButton}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Apple&apos;s accounts can&apos;t connect automatically. Import the CSV export from Wallet and they show up
            everywhere: spending, categories, subscriptions, credit utilization and net worth.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Apple accounts (imported from statements)</h2>
        {importButton}
      </div>
      {cards.map((card) => {
        const isCard = card.type === "credit";
        const usedPct = isCard && card.creditLimit ? Math.round((Math.max(0, card.balance) / card.creditLimit) * 100) : null;
        return (
          <Card key={card.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>{card.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {card.transactionCount} imported transactions
                  {card.lastTransactionDate
                    ? ` · latest ${new Date(`${card.lastTransactionDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <EditDialog card={card} />
                <DeleteButton card={card} />
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              {isCard ? (
                <>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">Balance owed{card.hasBalanceOverride ? " (entered by you)" : ""}</p>
                    <Money amount={Math.max(0, card.balance)} currency="USD" tone="negative" className="text-2xl font-semibold" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {card.creditLimit
                      ? `${usedPct}% of ${formatCurrency(card.creditLimit, "USD")} limit`
                      : "No credit limit set. Add one with the pencil to see utilization."}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">Balance (entered by you)</p>
                    {card.balanceKnown ? (
                      <Money amount={card.balance} currency="USD" tone="positive" className="text-2xl font-semibold" />
                    ) : (
                      <p className="text-sm text-muted-foreground">Not entered yet. Add it with the pencil so it counts in net worth.</p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(card.earned, "USD")} earned in imported interest and Daily Cash
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
