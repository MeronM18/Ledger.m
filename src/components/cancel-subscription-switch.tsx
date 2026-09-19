"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export function CancelSubscriptionSwitch({
  streamId,
  cancelled,
}: {
  streamId: string;
  cancelled: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function handleChange(checked: boolean) {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/recurring-streams/${streamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_marked_cancelled: checked }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update subscription");
      }

      toast.success(checked ? "Marked as cancelled" : "Marked as active again");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {cancelled ? "Cancelled" : "Mark cancelled"}
      </span>
      <Switch checked={cancelled} disabled={isSaving} onCheckedChange={handleChange} />
    </div>
  );
}
