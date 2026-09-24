"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { humanizeFrequency } from "@/lib/plaid-categories";
import type { DetectedSubscription } from "@/lib/recurring-detection";

function Row({ s }: { s: DetectedSubscription }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    try {
      const res = await fetch("/api/manual-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name,
          amount: s.amount,
          frequency: s.frequency,
          next_billing_date: s.nextDate,
          notes: "Found on your Apple Card",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add subscription");
      }
      toast.success(`${s.name} added to your subscriptions`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add subscription");
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm text-bone">{s.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {humanizeFrequency(s.frequency)} · {s.occurrences} charges · last{" "}
          {new Date(`${s.lastDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      </div>
      <span className="shrink-0 text-right font-mono text-sm tabular-nums">
        {s.amountVaries && <span className="font-sans text-xs text-muted-foreground">~</span>}
        {formatCurrency(s.amount, "USD")}
      </span>
      <Button size="icon-sm" variant="outline" onClick={handleAdd} disabled={saving} aria-label={`Add ${s.name}`} title="Add to your subscriptions">
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

/** Recurring charges found in imported card transactions that aren't tracked yet. Renders nothing when there are none. */
export function DetectedSubscriptionsCard({ suggestions }: { suggestions: DetectedSubscription[] }) {
  if (suggestions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanSearch className="size-4 text-champagne" aria-hidden />
          Found on your Apple Card
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        <p className="pb-3 text-xs text-muted-foreground">These charge on a steady rhythm but aren&apos;t in your list yet. Add the real ones.</p>
        {suggestions.map((s) => (
          <Row key={`${s.name}-${s.amount}-${s.frequency}`} s={s} />
        ))}
      </CardContent>
    </Card>
  );
}
