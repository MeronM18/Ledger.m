import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Partial: the edit dialog sends the full set of fields, and the
// mark-as-cancelled toggle sends just { is_active } — one endpoint for
// both rather than a second route for the toggle.
const bodySchema = z
  .object({
    name: z.string().min(1),
    amount: z.number(),
    frequency: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY"]),
    next_billing_date: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    is_active: z.boolean(),
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

  const admin = createAdminClient();
  const { error } = await admin.from("manual_subscriptions").update(parsed.data).eq("id", id);

  if (error) {
    console.error("Failed to update manual subscription", error);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin.from("manual_subscriptions").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete manual subscription", error);
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
