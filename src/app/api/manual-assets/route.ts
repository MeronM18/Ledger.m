import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  name: z.string().min(1),
  category: z.enum(["cash", "crypto", "vehicle", "property", "other"]),
  value: z.number(),
  is_liability: z.boolean().default(false),
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
    .from("manual_assets")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("Failed to create manual asset", error);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }

  return NextResponse.json({ asset: data });
}
