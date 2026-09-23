"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
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
    <div className="flex flex-col gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{s.name}</p>
        <p className="text-xs text-muted-foreground">
          {humanizeFrequency(s.frequency)} · {s.occurrences} charges · last{" "}
          {new Date(`${s.lastDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {s.amountVaries ? " · amount varies" : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm">
          {s.amountVaries && <span className="text-muted-foreground">about </span>}
          <Money amount={s.amount} tone="negative" className="font-medium" />
        </span>
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={saving}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
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
        <p className="pb-3 text-xs text-muted-foreground">
          These charge on a steady rhythm but aren&apos;t in your list yet. Add the ones that are real subscriptions.
        </p>
        {suggestions.map((s) => (
          <Row key={`${s.name}-${s.amount}-${s.frequency}`} s={s} />
        ))}
      </CardContent>
    </Card>
  );
}
