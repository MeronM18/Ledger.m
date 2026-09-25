"use client";

import { useRouter } from "next/navigation";
import { ListChecks, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { humanizeCategory } from "@/lib/plaid-categories";
import type { MerchantRule } from "@/lib/transaction-edits";

/** The Rules button on Transactions: every rename and recategorize rule, in a panel, each removable. */
export function MerchantRulesButton({ rules, label = "Rules" }: { rules: MerchantRule[]; label?: string }) {
  const router = useRouter();

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
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <ListChecks className="size-3.5" />
          {label}
          {rules.length > 0 && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{rules.length}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Rules</SheetTitle>
          <SheetDescription>
            A rule renames or recategorizes every transaction whose merchant contains its text, past and future. Make one
            from a transaction: open it and tick &ldquo;Apply the name/category to every matching transaction&rdquo;.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {rules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No rules yet.</p>
          ) : (
            <ul className="flex flex-col">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Contains </span>
                    <span className="font-medium">&ldquo;{r.match_text}&rdquo;</span>
                    <span className="text-muted-foreground"> → </span>
                    {[r.rename_to, r.category ? humanizeCategory(r.category) : null].filter(Boolean).join(" · ")}
                  </p>
                  <Button size="icon" variant="ghost" aria-label={`Delete rule ${r.match_text}`} onClick={() => handleDelete(r.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
