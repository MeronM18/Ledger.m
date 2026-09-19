import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  metal: z.enum(["gold", "silver"]),
  weight: z.number().positive(),
  weight_unit: z.enum(["oz", "g"]),
  purity: z.number().positive().max(1),
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
  const { error } = await admin.from("precious_metal_holdings").update(parsed.data).eq("id", id);

  if (error) {
    console.error("Failed to update precious metal holding", error);
    return NextResponse.json({ error: "Failed to update holding" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin.from("precious_metal_holdings").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete precious metal holding", error);
    return NextResponse.json({ error: "Failed to delete holding" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
