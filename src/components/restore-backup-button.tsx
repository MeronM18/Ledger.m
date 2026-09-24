"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RESTORE_LABELS, restorePayload, type RestorePayload } from "@/lib/backup-restore";

type Preview = { exportedAt: string | null; counts: Record<string, number>; unmatchedEdits: number };

async function post(payload: RestorePayload, dryRun: boolean) {
  const res = await fetch("/api/backup/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, dry_run: dryRun }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The restore didn't work. Nothing was changed.");
  return data;
}

/**
 * Pick a backup file, see what it will bring back, then restore it. Nothing
 * is written until "Restore" is pressed, and restoring merges: it never
 * deletes anything made since the backup.
 */
export function RestoreBackupButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<RestorePayload | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"reading" | "restoring" | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("reading");
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("That file isn't a Ledger.m backup.");
      }
      const result = restorePayload(parsed);
      if ("error" in result) throw new Error(result.error);
      setPreview(await post(result.payload, true));
      setPayload(result.payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that file");
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    if (!payload) return;
    setBusy("restoring");
    try {
      const result = await post(payload, false);
      const total = Object.values(result.written as Record<string, number>).reduce((a, b) => a + b, 0);
      toast.success(`Restored ${total.toLocaleString("en-US")} item${total === 1 ? "" : "s"} from the backup`);
      setPayload(null);
      setPreview(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The restore didn't finish");
    } finally {
      setBusy(null);
    }
  }

  const rows = preview ? Object.entries(preview.counts).filter(([, n]) => n > 0) : [];
  const when = preview?.exportedAt
    ? new Date(preview.exportedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })
    : null;

  return (
    <>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} aria-label="Backup file" />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={busy !== null}>
        {busy === "reading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        Restore from backup
      </Button>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && busy !== "restoring") {
            setPreview(null);
            setPayload(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              {when ? `Made ${when}. ` : ""}Everything below comes back as it was in the backup. Nothing you&apos;ve added
              since is deleted, and your bank connections aren&apos;t touched.
            </DialogDescription>
          </DialogHeader>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">There&apos;s nothing in this backup to restore.</p>
          ) : (
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 rounded-md border border-border p-3 text-sm">
              {rows.map(([table, n]) => (
                <div key={table} className="contents">
                  <dt className="text-muted-foreground">{RESTORE_LABELS[table] ?? table}</dt>
                  <dd className="text-right font-mono tabular-nums">{n.toLocaleString("en-US")}</dd>
                </div>
              ))}
            </dl>
          )}
          {preview && preview.unmatchedEdits > 0 && (
            <p className="text-xs text-muted-foreground">
              {preview.unmatchedEdits} edit{preview.unmatchedEdits === 1 ? " is" : "s are"} for bank transactions that
              aren&apos;t here now (removed by the bank, or from a bank that isn&apos;t connected), so{" "}
              {preview.unmatchedEdits === 1 ? "it" : "they"} can&apos;t be restored.
            </p>
          )}
          <DialogFooter>
            <Button onClick={handleRestore} disabled={busy !== null || rows.length === 0}>
              {busy === "restoring" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {busy === "restoring" ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
