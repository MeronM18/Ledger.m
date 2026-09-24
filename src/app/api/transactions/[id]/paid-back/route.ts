import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  // How much was paid back in cash; null clears it.
  amount: z.number().positive().max(10_000_000).nullable(),
  // Which table the transaction lives in: a manual/imported one or a bank one.
  manual: z.boolean(),
});

/**
 * Records that someone paid you back, in cash, for a charge you covered for
 * them. Only your share then counts as spending. Deliberately separate from
 * the manual-transaction edit route: that one moves the Cash asset when an
 * amount changes, and money handed back here must not.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { amount, manual } = parsed.data;

  const admin = createAdminClient();
  const { data: tx, error: txError } = await admin
    .from(manual ? "manual_transactions" : "transactions")
    .select("amount")
    .eq("id", id)
    .maybeSingle();
  if (txError || !tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const charge = Number(tx.amount);
  if (amount !== null && charge <= 0) {
    return NextResponse.json({ error: "Only a charge (money out) can be paid back" }, { status: 400 });
  }
  if (amount !== null && amount > charge + 0.005) {
    return NextResponse.json({ error: `That's more than the charge of $${charge.toFixed(2)}` }, { status: 400 });
  }

  if (manual) {
    const { error } = await admin.from("manual_transactions").update({ reimbursed_amount: amount }).eq("id", id);
    if (error) {
      console.error("Failed to save paid-back amount", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // A bank transaction's edits live in transaction_overrides. Only this
  // column is written, so a rename or category set there stays.
  const { error } = await admin
    .from("transaction_overrides")
    .upsert({ transaction_id: id, reimbursed_amount: amount }, { onConflict: "transaction_id" });
  if (error) {
    console.error("Failed to save paid-back amount", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  if (amount === null) {
    // Nothing left on the row at all: remove it, so the transaction stops
    // showing as edited.
    await admin
      .from("transaction_overrides")
      .delete()
      .eq("transaction_id", id)
      .is("category", null)
      .is("merchant_name", null)
      .is("notes", null)
      .is("reimbursed_amount", null);
  }
  return NextResponse.json({ ok: true });
}
