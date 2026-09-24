"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Percent } from "lucide-react";
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

/** Sets the APY of a connected savings account. Banks don't report it through Plaid, so it's entered by hand. */
export function AccountApyButton({ accountId, name, apy }: { accountId: string; name: string; apy: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState("");

  function handleOpenChange(next: boolean) {
    if (next) setValue(apy !== null ? String(apy) : "");
    setOpen(next);
  }

  async function handleSave() {
    const parsed = value === "" ? null : Number(value);
    if (parsed !== null && !(parsed >= 0 && parsed <= 100)) {
      toast.error("Enter the APY as a percent, like 3.39");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apy: parsed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save APY");
      }
      toast.success(parsed === null ? "APY cleared" : "APY saved");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save APY");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`${apy === null ? "Set" : "Edit"} APY for ${name}`}>
          <Percent className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>APY for {name}</DialogTitle>
          <DialogDescription>
            Your bank doesn&apos;t share the yield with connected apps, so type it in from the account or a statement.
            Leave it blank to clear it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-apy">APY (%)</Label>
          <Input id="account-apy" type="number" min="0" max="100" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 3.40" />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
