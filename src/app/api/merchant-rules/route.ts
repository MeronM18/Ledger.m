import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { ALL_PFC_CATEGORIES } from "@/lib/plaid-categories";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z
  .object({
    match_text: z.string().trim().min(2).max(120),
    rename_to: z.string().trim().max(120).nullable().optional(),
    category: z.enum(ALL_PFC_CATEGORIES).nullable().optional(),
  })
  .refine((v) => Boolean(v.rename_to) || Boolean(v.category), {
    message: "A rule needs a new name or a category",
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
    .from("merchant_rules")
    .insert({
      match_text: parsed.data.match_text,
      rename_to: parsed.data.rename_to || null,
      category: parsed.data.category ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create merchant rule", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }

  return NextResponse.json({ rule: data });
}
