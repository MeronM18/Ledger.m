"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type PriceResult =
  | { metal: "gold" | "silver"; ok: true; price: number }
  | { metal: "gold" | "silver"; ok: false; error: string };

export function RefreshMetalPricesButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleClick() {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/metal-prices/refresh", { method: "POST" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !Array.isArray(data?.results)) {
        toast.error("Refresh failed", { description: data?.error ?? "Unknown error" });
        return;
      }

      const results = data.results as PriceResult[];
      const failed = results.filter((r): r is Extract<PriceResult, { ok: false }> => !r.ok);

      if (failed.length === 0) {
        toast.success("Prices refreshed", {
          description: results
            .map((r) => (r.ok ? `${r.metal === "gold" ? "Gold" : "Silver"} $${r.price.toFixed(2)}/oz` : ""))
            .filter(Boolean)
            .join(" · "),
        });
      } else {
        toast.error(`${failed.length}/${results.length} metals failed to refresh`, {
          description: failed.map((r) => `${r.metal === "gold" ? "Gold" : "Silver"}: ${r.error}`).join(" · "),
        });
      }

      router.refresh();
    } catch (err) {
      toast.error("Refresh failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isRefreshing}>
      <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
      {isRefreshing ? "Refreshing..." : "Refresh prices"}
    </Button>
  );
}
