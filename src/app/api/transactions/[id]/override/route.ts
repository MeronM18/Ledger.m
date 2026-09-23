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
    const { error } = await admin.from("transaction_overrides").delete().eq("transaction_id", id);
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

  const admin = createAdminClient();
  const { error } = await admin.from("transaction_overrides").delete().eq("transaction_id", id);

  if (error) {
    console.error("Failed to reset transaction override", error);
    return NextResponse.json({ error: "Failed to reset transaction" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
