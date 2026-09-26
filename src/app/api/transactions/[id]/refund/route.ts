import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { cameBackOn, isPurchase, isRefund, NO_PURCHASE, resolveRefundChoices } from "@/lib/refunds";
import { loadLedger } from "@/lib/spending-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { REFUND_CHOICES_KEY } from "@/lib/ui-preferences";

const bodySchema = z.object({
  // The purchase it's for, "none" to count it on the day it came back, or null to let it be found.
  purchase: z.string().min(1).max(100).nullable(),
});

const monthOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

/**
 * Says which purchase a refund is for, so it counts in that purchase's
 * month, or that it's for none. Only how it's counted changes; the
 * transaction itself is left as the bank sent it.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { purchase } = parsed.data;

  const admin = createAdminClient();
  const ledger = await loadLedger(admin);
  if (ledger.error) return NextResponse.json({ error: "Couldn't load your transactions" }, { status: 500 });
  const refund = ledger.transactions.find((t) => t.id === id);
  if (!refund || !isRefund(refund)) return NextResponse.json({ error: "Refund not found" }, { status: 404 });

  let message = "It's matched automatically again";
  if (purchase === NO_PURCHASE) {
    message = `Counted in ${monthOf(cameBackOn(refund))}, when it came back`;
  } else if (purchase !== null) {
    const bought = ledger.transactions.find((t) => t.id === purchase);
    if (!bought || !isPurchase(bought)) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    if (bought.date > cameBackOn(refund)) return NextResponse.json({ error: "That purchase is after the refund came back" }, { status: 400 });
    message = `Counted in ${monthOf(bought.date)}, with its purchase`;
  }

  const { data, error: readError } = await admin.from("ui_preferences").select("value").eq("key", REFUND_CHOICES_KEY).maybeSingle();
  if (readError) {
    console.error("Failed to read refund choices", readError);
    return NextResponse.json({ error: "Couldn't save" }, { status: 500 });
  }
  const choices = resolveRefundChoices(data?.value);
  if (purchase === null) delete choices[id];
  else choices[id] = purchase;

  const { error } = await admin.from("ui_preferences").upsert({ key: REFUND_CHOICES_KEY, value: choices }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save a refund's purchase", error);
    return NextResponse.json({ error: "Couldn't save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message });
}
