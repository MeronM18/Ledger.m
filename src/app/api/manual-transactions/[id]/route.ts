import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { adjustCashAsset, cashDeltaForTransaction } from "@/lib/cash-asset-sync";
import { ALL_PFC_CATEGORIES } from "@/lib/plaid-categories";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  date: z.string().min(1),
  name: z.string().min(1),
  amount: z.number(),
  pfc_primary: z.enum(ALL_PFC_CATEGORIES),
  payment_method: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch the pre-edit amount/payment_method so the Cash asset can be
  // adjusted by the difference rather than double-applying the new amount —
  // e.g. editing a $20 cash purchase up to $30 should only pull Cash down by
  // another $10, not by $30 again.
  const { data: previous, error: fetchError } = await admin
    .from("manual_transactions")
    .select("amount, payment_method")
    .eq("id", id)
    .single();
  if (fetchError) {
    console.error("Failed to load manual transaction before update", fetchError);
  }

  const { error } = await admin.from("manual_transactions").update(parsed.data).eq("id", id);

  if (error) {
    console.error("Failed to update manual transaction", error);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }

  if (previous) {
    const oldDelta = cashDeltaForTransaction(previous.amount, previous.payment_method);
    const newDelta = cashDeltaForTransaction(parsed.data.amount, parsed.data.payment_method);
    await adjustCashAsset(admin, newDelta - oldDelta);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = createAdminClient();

  const { data: previous, error: fetchError } = await admin
    .from("manual_transactions")
    .select("amount, payment_method")
    .eq("id", id)
    .single();
  if (fetchError) {
    console.error("Failed to load manual transaction before delete", fetchError);
  }

  const { error } = await admin.from("manual_transactions").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete manual transaction", error);
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }

  if (previous) {
    const originalDelta = cashDeltaForTransaction(previous.amount, previous.payment_method);
    await adjustCashAsset(admin, -originalDelta);
  }

  return NextResponse.json({ ok: true });
}
