"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const whole = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * When the monthly budget is far below what the last few months actually
 * cost, a nudge to set one that fits: a budget that's over every month says
 * nothing. One tap sets it (the same as setting it on Budgets).
 */
export function BudgetSuggestion({ average, suggested, current }: { average: number; suggested: number; current: number }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    try {
      const res = await fetch("/api/budgets/monthly", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: suggested }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't update the budget");
      toast.success(`Monthly budget set to ${whole(suggested)}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-champagne/20 bg-champagne/[0.05] px-3 py-2.5">
      <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-champagne" aria-hidden />
        <span>
          Your last three months averaged <span className="font-mono text-bone tabular-nums">{whole(average)}</span>, so a {whole(current)} budget runs over
          almost every month.
        </span>
      </p>
      <Button type="button" size="xs" variant="outline" disabled={saving} onClick={apply} className="self-start border-champagne/35 text-champagne hover:bg-champagne/10 hover:text-champagne">
        {saving ? "Saving..." : `Set it to ${whole(suggested)}`}
      </Button>
    </div>
  );
}
