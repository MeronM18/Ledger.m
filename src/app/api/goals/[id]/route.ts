import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Partial edit, plus add_amount to add (or, if negative, take out) money
// without the client needing to know the current total.
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    target_amount: z.number().positive().max(100_000_000),
    saved_amount: z.number().min(0).max(100_000_000),
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    account_id: z.string().uuid().nullable(),
    add_amount: z.number().min(-100_000_000).max(100_000_000),
  })
  .partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { add_amount, ...changes } = parsed.data;
  const admin = createAdminClient();
  const update: Record<string, unknown> = { ...changes };

  if (add_amount !== undefined) {
    const { data: current, error: readError } = await admin
      .from("savings_goals")
      .select("saved_amount")
      .eq("id", id)
      .single();
    if (readError || !current) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    // Never below zero, so taking out more than was there just empties it.
    update.saved_amount = Math.max(0, Number(current.saved_amount) + add_amount);
  }

  const { error } = await admin.from("savings_goals").update(update).eq("id", id);
  if (error) {
    console.error("Failed to update savings goal", error);
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("savings_goals").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete savings goal", error);
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
