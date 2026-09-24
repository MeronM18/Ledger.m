import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Only the yield is editable here: everything else on a connected account
// comes from the bank and would be overwritten by the next sync. Sync never
// touches apy, so what's entered stays.
const bodySchema = z.object({
  apy: z.number().min(0).max(100).nullable(),
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
  const { error } = await admin.from("accounts").update({ apy: parsed.data.apy }).eq("id", id);
  if (error) {
    console.error("Failed to update account APY", error);
    return NextResponse.json({ error: "Failed to update APY" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
