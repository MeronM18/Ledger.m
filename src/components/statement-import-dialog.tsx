"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, TriangleAlert } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ParsedStatement } from "@/lib/statement-import";

type AccountOption = { id: string; name: string; mask: string | null };
type FileResult = { name: string; statement?: ParsedStatement; error?: string };
type Plan = {
  statements: number;
  transactions: number;
  toAdd: number;
  alreadyImported: number;
  alreadySynced: number;
  firstDate: string | null;
  lastDate: string | null;
};

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function planFor(accountId: string, statements: ParsedStatement[], dryRun: boolean): Promise<Plan & { added: number }> {
  const res = await fetch("/api/import/bank-statement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_id: accountId, statements, dry_run: dryRun }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/**
 * Adds older history to a connected account from the bank's PDF
 * statements: from before the bank connection's history starts, or from a
 * bank the account came from (Comerica, before it became Fifth Third).
 * Each PDF is read and checked against its own totals first; then the
 * preview says how many are new and how many are already there, and
 * nothing is added until you confirm.
 */
export function StatementImportDialog({ accounts, institutionName }: { accounts: AccountOption[]; institutionName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [files, setFiles] = useState<FileResult[]>([]);
  const [reading, setReading] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);

  const good = files.filter((f) => f.statement && f.statement.problems.length === 0).map((f) => f.statement!);

  function handleOpenChange(next: boolean) {
    if (next) {
      setFiles([]);
      setPlan(null);
      setReading(0);
    }
    setOpen(next);
  }

  async function preview(statements: ParsedStatement[], account: string) {
    setPlan(null);
    if (statements.length === 0 || !account) return;
    try {
      setPlan(await planFor(account, statements, true));
    } catch (err) {
      toast.error("Couldn't check these statements", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setPlan(null);
    const results: FileResult[] = [];
    setReading(picked.length);
    for (const file of picked) {
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch("/api/import/bank-statement/parse", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        results.push(res.ok ? { name: file.name, statement: data.statement } : { name: file.name, error: data.error ?? "Couldn't read it" });
      } catch {
        results.push({ name: file.name, error: "Couldn't upload it" });
      }
      setReading((n) => n - 1);
    }
    results.sort((a, b) => (a.statement?.periodStart ?? "").localeCompare(b.statement?.periodStart ?? ""));
    setFiles(results);
    await preview(
      results.filter((f) => f.statement && f.statement.problems.length === 0).map((f) => f.statement!),
      accountId
    );
  }

  async function handleImport() {
    setSaving(true);
    try {
      const result = await planFor(accountId, good, false);
      toast.success(
        result.added === 0
          ? "Nothing new to add: it was all already there"
          : `Added ${result.added.toLocaleString("en-US")} transactions from ${result.statements} statements`
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Import didn't finish", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  const failed = files.filter((f) => !f.statement || f.statement.problems.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="self-start text-muted-foreground hover:text-champagne">
          <FileUp className="size-3.5" />
          Import past statements
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import past statements</DialogTitle>
          <DialogDescription>
            Add older history to {institutionName} from the bank&apos;s PDF statements (Comerica checking statements
            work, including those from before the Fifth Third merger). Each one is checked against its own totals, and
            anything already here, imported or synced, is skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {accounts.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Add to</Label>
              <Select
                value={accountId}
                onValueChange={(v) => {
                  setAccountId(v);
                  void preview(good, v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.mask ? ` ••${a.mask}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="statement-files">Statement PDFs</Label>
            <Input id="statement-files" type="file" accept="application/pdf,.pdf" multiple onChange={handleFiles} disabled={reading > 0 || saving} />
            {reading > 0 && <p className="text-xs text-muted-foreground">Reading {reading} left...</p>}
          </div>

          {files.length > 0 && reading === 0 && (
            <div className="flex flex-col gap-3 text-sm">
              <p className="flex items-center gap-2">
                <Check className="size-4 text-moss" aria-hidden />
                {good.length} of {files.length} statements read and checked
                {good.length > 0 &&
                  `: ${longDate(good[0].periodStart)} to ${longDate(good[good.length - 1].periodEnd)}, account ending ${good[0].accountLast4 ?? "?"}`}
              </p>
              {failed.map((f) => (
                <p key={f.name} className="flex items-start gap-2 text-oxblood-text">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {f.name}: {(f.error ?? f.statement?.problems[0] ?? "").replace(/\.$/, "")}. It won&apos;t be imported.
                  </span>
                </p>
              ))}
            </div>
          )}

          {plan && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 rounded-md border border-border p-3 text-sm">
              <dt className="text-muted-foreground">Transactions found</dt>
              <dd className="text-right font-mono tabular-nums">{plan.transactions.toLocaleString("en-US")}</dd>
              <dt className="text-muted-foreground">Already synced from the bank</dt>
              <dd className="text-right font-mono tabular-nums">{plan.alreadySynced.toLocaleString("en-US")}</dd>
              <dt className="text-muted-foreground">Already imported</dt>
              <dd className="text-right font-mono tabular-nums">{plan.alreadyImported.toLocaleString("en-US")}</dd>
              <dt className="font-medium">New, to add</dt>
              <dd className="text-right font-mono font-medium text-moss tabular-nums">{plan.toAdd.toLocaleString("en-US")}</dd>
            </dl>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleImport} disabled={!plan || plan.toAdd === 0 || saving}>
            {saving ? "Adding..." : plan && plan.toAdd > 0 ? `Add ${plan.toAdd.toLocaleString("en-US")} transactions` : "Add transactions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
