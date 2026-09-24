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
  name: string;
  balance: number;
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

function ImportDialog({ card, trigger }: { card?: AppleCard; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [limit, setLimit] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) {
      setFile(null);
      setLimit(card?.creditLimit ? String(card.creditLimit) : "");
    }
    setOpen(next);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile({ name: picked.name, text: await picked.text() });
  }

  async function handleImport() {
    if (!file) {
      toast.error("Choose your Apple Card CSV first");
      return;
    }
    const limitValue = limit === "" ? undefined : Number(limit);
    if (limitValue !== undefined && (!Number.isFinite(limitValue) || limitValue <= 0)) {
      toast.error("Enter the credit limit as a number above 0, or leave it blank");
      return;
    }
    setSaving(true);
    try {
      const result = await send("/api/import/apple-card", "POST", {
        csv: file.text,
        ...(card ? { account_id: card.id } : {}),
        ...(limitValue !== undefined ? { credit_limit: limitValue } : {}),
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
          <DialogTitle>Import Apple Card statement</DialogTitle>
          <DialogDescription>
            In the Wallet app, open Apple Card, choose Statements, and export as CSV. You can import several files;
            anything already imported is skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-csv">CSV file</Label>
            <Input id="apple-csv" type="file" accept=".csv,text/csv" onChange={handleFile} />
            {file && <p className="text-xs text-muted-foreground">Ready: {file.name}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-limit">Credit limit{card ? "" : " (optional)"}</Label>
            <Input
              id="apple-limit"
              type="number"
              min="0"
              step="100"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 5000"
            />
            <p className="text-xs text-muted-foreground">Shown in your credit utilization. Find it in Wallet under Apple Card.</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleImport} disabled={saving || !file}>
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
    if ((limitValue !== null && !(limitValue > 0)) || (balanceValue !== null && !Number.isFinite(balanceValue))) {
      toast.error("Enter valid numbers, or leave a field blank");
      return;
    }
    setSaving(true);
    try {
      await send(`/api/manual-accounts/${card.id}`, "PATCH", { credit_limit: limitValue, balance_override: balanceValue });
      toast.success("Apple Card updated");
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
        <Button size="icon" variant="ghost" aria-label="Edit Apple Card">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Apple Card</DialogTitle>
          <DialogDescription>
            The balance is worked out from your imported transactions. If it doesn&apos;t match Wallet (for example,
            your statements don&apos;t go back to the day you opened the card), type the real balance here.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-edit-limit">Credit limit</Label>
            <Input id="apple-edit-limit" type="number" min="0" step="100" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-edit-balance">Current balance (optional)</Label>
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
      toast.success("Apple Card removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <Button size="icon" variant="ghost" aria-label="Remove Apple Card" onClick={handleDelete}>
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function AppleCardSection({ cards }: { cards: AppleCard[] }) {
  if (cards.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Apple Card</CardTitle>
          <ImportDialog
            trigger={
              <Button size="sm" variant="outline">
                <FileUp className="size-3.5" />
                Import statement
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Apple Card can&apos;t connect automatically. Import the statement CSV from Wallet and its purchases show up
            everywhere: spending, categories, subscriptions and your credit utilization.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {cards.map((card) => {
        const usedPct = card.creditLimit ? Math.round((Math.max(0, card.balance) / card.creditLimit) * 100) : null;
        return (
          <Card key={card.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>{card.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Imported from statements · {card.transactionCount} transactions
                  {card.lastTransactionDate
                    ? ` · latest ${new Date(`${card.lastTransactionDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ImportDialog
                  card={card}
                  trigger={
                    <Button size="sm" variant="outline">
                      <FileUp className="size-3.5" />
                      Import statement
                    </Button>
                  }
                />
                <EditDialog card={card} />
                <DeleteButton card={card} />
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Balance owed{card.hasBalanceOverride ? " (entered by you)" : ""}</p>
                <Money amount={Math.max(0, card.balance)} currency="USD" tone="negative" className="text-2xl font-semibold" />
              </div>
              <p className="text-sm text-muted-foreground">
                {card.creditLimit
                  ? `${usedPct}% of ${formatCurrency(card.creditLimit, "USD")} limit`
                  : "No credit limit set. Add one with the pencil to see utilization."}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
