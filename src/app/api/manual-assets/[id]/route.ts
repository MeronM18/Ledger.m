import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  name: z.string().min(1),
  category: z.enum(["cash", "crypto", "vehicle", "property", "other"]),
  value: z.number(),
  is_liability: z.boolean(),
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
  const { error } = await admin.from("manual_assets").update(parsed.data).eq("id", id);

  if (error) {
    console.error("Failed to update manual asset", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin.from("manual_assets").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete manual asset", error);
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
