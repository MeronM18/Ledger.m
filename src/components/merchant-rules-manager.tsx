"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeCategory } from "@/lib/plaid-categories";
import type { MerchantRule } from "@/lib/transaction-edits";

export function MerchantRulesManager({ rules }: { rules: MerchantRule[] }) {
  const router = useRouter();

  if (rules.length === 0) return null;

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/merchant-rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete rule");
      }
      toast.success("Rule removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {rules.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between border-t border-border py-2 first:border-t-0 first:pt-0"
          >
            <p className="text-sm">
              <span className="text-muted-foreground">Contains </span>
              <span className="font-medium">&ldquo;{r.match_text}&rdquo;</span>
              <span className="text-muted-foreground"> → </span>
              {[r.rename_to, r.category ? humanizeCategory(r.category) : null].filter(Boolean).join(" · ")}
            </p>
            <Button size="icon" variant="ghost" aria-label={`Delete rule ${r.match_text}`} onClick={() => handleDelete(r.id)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
