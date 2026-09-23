import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin.from("budgets").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete budget", error);
    return NextResponse.json({ error: "Failed to delete budget" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
