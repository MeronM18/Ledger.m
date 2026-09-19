import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  metal: z.enum(["gold", "silver"]),
  weight: z.number().positive(),
  weight_unit: z.enum(["oz", "g"]),
  purity: z.number().positive().max(1).default(1),
  notes: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("precious_metal_holdings")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("Failed to create precious metal holding", error);
    return NextResponse.json({ error: "Failed to create holding" }, { status: 500 });
  }

  return NextResponse.json({ holding: data });
}
