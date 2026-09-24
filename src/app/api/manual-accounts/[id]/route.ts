import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    credit_limit: z.number().positive().max(10_000_000).nullable(),
    // null clears it, so the balance goes back to being worked out from the transactions.
    balance_override: z.number().min(-10_000_000).max(10_000_000).nullable(),
    apy: z.number().min(0).max(100).nullable(),
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
  const { error } = await admin.from("manual_accounts").update(parsed.data).eq("id", id);
  if (error) {
    console.error("Failed to update manual account", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Removes the account and, by cascade, every transaction imported into it.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("manual_accounts").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete manual account", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
