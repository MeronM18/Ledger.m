import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { ALL_PFC_CATEGORIES } from "@/lib/plaid-categories";
import { createAdminClient } from "@/lib/supabase/admin";

// Each field is optional; null or blank clears that field. Sending nothing
// but blanks removes the override row entirely.
const bodySchema = z.object({
  category: z.enum(ALL_PFC_CATEGORIES).nullable().optional(),
  merchant_name: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Clears the name, category and note. A paid-back amount on the same row
 * is its own thing and stays; the row goes only once nothing is left on it.
 */
async function clearEdits(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { error } = await admin
    .from("transaction_overrides")
    .update({ category: null, merchant_name: null, notes: null })
    .eq("transaction_id", id);
  if (error) return error;
  const { error: deleteError } = await admin
    .from("transaction_overrides")
    .delete()
    .eq("transaction_id", id)
    .is("reimbursed_amount", null);
  // Before migration 0015 there's no reimbursed_amount column: every row can go.
  if (deleteError?.code === "42703") {
    return (await admin.from("transaction_overrides").delete().eq("transaction_id", id)).error;
  }
  return deleteError;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const category = parsed.data.category ?? null;
  const merchantName = parsed.data.merchant_name || null;
  const notes = parsed.data.notes || null;

  const admin = createAdminClient();

  if (!category && !merchantName && !notes) {
    const error = await clearEdits(admin, id);
    if (error) {
      console.error("Failed to clear transaction override", error);
      return NextResponse.json({ error: "Failed to save changes" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cleared: true });
  }

  const { error } = await admin
    .from("transaction_overrides")
    .upsert({ transaction_id: id, category, merchant_name: merchantName, notes });

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    console.error("Failed to save transaction override", error);
    return NextResponse.json({ error: "Failed to save changes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const error = await clearEdits(createAdminClient(), id);

  if (error) {
    console.error("Failed to reset transaction override", error);
    return NextResponse.json({ error: "Failed to reset transaction" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
