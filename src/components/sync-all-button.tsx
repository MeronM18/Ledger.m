"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SyncResult =
  | { itemId: string; ok: true; added: number; modified: number; removed: number; notified: number }
  | { itemId: string; ok: false; error: string };

export function SyncAllButton({ items }: { items: { id: string; institution_name: string | null }[] }) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleClick() {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !Array.isArray(data?.results)) {
        toast.error("Sync failed", { description: data?.error ?? "Unknown error" });
        return;
      }

      const results = data.results as SyncResult[];
      const succeeded = results.filter((r): r is Extract<SyncResult, { ok: true }> => r.ok);
      const failed = results.filter((r): r is Extract<SyncResult, { ok: false }> => !r.ok);

      const totals = succeeded.reduce(
        (sum, r) => ({
          added: sum.added + r.added,
          modified: sum.modified + r.modified,
          removed: sum.removed + r.removed,
        }),
        { added: 0, modified: 0, removed: 0 }
      );

      const institutionName = (itemId: string) =>
        items.find((i) => i.id === itemId)?.institution_name ?? "Unknown institution";

      if (failed.length === 0) {
        toast.success("Sync complete", {
          description: `${totals.added} added · ${totals.modified} modified · ${totals.removed} removed across ${succeeded.length} account${succeeded.length === 1 ? "" : "s"}`,
        });
      } else {
        const failedNames = failed.map((r) => institutionName(r.itemId)).join(", ");
        toast.error(`${failed.length}/${results.length} accounts failed to sync`, {
          description:
            succeeded.length > 0
              ? `${totals.added} added · ${totals.modified} modified · ${totals.removed} removed across ${succeeded.length} account${succeeded.length === 1 ? "" : "s"}. Failed: ${failedNames}.`
              : `Failed: ${failedNames}.`,
        });
      }

      router.refresh();
    } catch (err) {
      toast.error("Sync failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isSyncing}>
      <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "Syncing all..." : "Sync all"}
    </Button>
  );
}
