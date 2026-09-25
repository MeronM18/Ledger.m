"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROGRAMS, type ProgramId } from "@/lib/card-rewards";

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

function parseDay(value: string): number | null | "bad" {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : "bad";
}

/**
 * Your own name for a connected account and, for a credit card, the days
 * its statement closes and its payment is due. The closing day is what
 * lines card payments up with the purchases they paid for.
 */
export function AccountSettingsButton({
  accountId,
  name,
  bankName,
  nickname,
  isCard,
  closeDay,
  dueDay,
  suggestedCloseDay,
  rewardsProgram = null,
  detectedProgram = null,
}: {
  accountId: string;
  name: string; // what's shown now
  bankName: string; // what the bank calls it, for the placeholder
  nickname: string | null;
  isCard: boolean;
  closeDay: number | null;
  dueDay: number | null;
  // The best guess when no closing day is set, and how it was reached.
  suggestedCloseDay: { day: number; from: "payments" | "due-date" } | null;
  // The rewards program picked for the card, and the one its names suggest.
  rewardsProgram?: ProgramId | "none" | null;
  detectedProgram?: ProgramId | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nickname: "", close: "", due: "", rewards: "auto" });

  function handleOpenChange(next: boolean) {
    if (next)
      setForm({
        nickname: nickname ?? "",
        close: closeDay ? String(closeDay) : "",
        due: dueDay ? String(dueDay) : "",
        rewards: rewardsProgram ?? "auto",
      });
    setOpen(next);
  }

  async function handleSave() {
    const close = parseDay(form.close);
    const due = parseDay(form.due);
    if (close === "bad" || due === "bad") {
      toast.error("Enter a day of the month, 1 to 31");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: form.nickname.trim() || null,
          ...(isCard
            ? { statement_close_day: close, payment_due_day: due, rewards_program: form.rewards === "auto" ? null : form.rewards }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      toast.success("Saved");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Edit ${name}`}>
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {name}</DialogTitle>
          <DialogDescription>
            {isCard
              ? "Name the card, and tell Ledger.m when its statement closes, so each payment shows the purchases it paid for."
              : "Give this account a name of your own. The bank's name stays as it is."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`nickname-${accountId}`}>Name</Label>
            <Input
              id={`nickname-${accountId}`}
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              placeholder={isCard ? `e.g. Freedom Flex (bank calls it ${bankName})` : bankName}
              maxLength={60}
            />
          </div>
          {isCard && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`close-${accountId}`}>Statement closing day</Label>
                <Input
                  id={`close-${accountId}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  value={form.close}
                  onChange={(e) => setForm((f) => ({ ...f, close: e.target.value }))}
                  placeholder={suggestedCloseDay ? String(suggestedCloseDay.day) : "e.g. 3"}
                />
                <p className="text-xs text-muted-foreground">
                  Printed on your statement as the closing date.
                  {!closeDay &&
                    suggestedCloseDay &&
                    ` Until you set it, the ${ordinal(suggestedCloseDay.day)} is used, ${
                      suggestedCloseDay.from === "payments" ? "worked out from your past payments" : "estimated from the due date"
                    }.`}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`due-${accountId}`}>Payment due day</Label>
                <Input
                  id={`due-${accountId}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  value={form.due}
                  onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))}
                  placeholder="e.g. 28"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rewards-${accountId}`}>Rewards</Label>
                <Select value={form.rewards} onValueChange={(v) => setForm((f) => ({ ...f, rewards: v }))}>
                  <SelectTrigger id={`rewards-${accountId}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="auto">
                      {detectedProgram ? `${PROGRAMS[detectedProgram].name} (from its name)` : "Not recognized from its name"}
                    </SelectItem>
                    {(Object.keys(PROGRAMS) as ProgramId[]).map((id) => (
                      <SelectItem key={id} value={id}>
                        {PROGRAMS[id].name}
                      </SelectItem>
                    ))}
                    <SelectItem value="none">No rewards</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">What each purchase on this card earns, shown on its transactions.</p>
              </div>
            </>
          )}
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
