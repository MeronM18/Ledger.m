"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SyncNowButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleClick() {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.results?.[0]) {
        toast.error("Sync failed", { description: data?.error ?? "Unknown error" });
        return;
      }

      const result = data.results[0];
      if (!result.ok) {
        toast.error("Sync failed", { description: result.error });
      } else {
        toast.success("Sync complete", {
          description: `${result.added} added · ${result.modified} modified · ${result.removed} removed`,
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
      {isSyncing ? "Syncing..." : "Sync now"}
    </Button>
  );
}
