import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { ALL_PFC_CATEGORIES } from "@/lib/plaid-categories";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  date: z.string().min(1),
  name: z.string().min(1),
  amount: z.number(),
  pfc_primary: z.enum(ALL_PFC_CATEGORIES),
  payment_method: z.string().optional().nullable(),
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
    .from("manual_transactions")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("Failed to create manual transaction", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }

  return NextResponse.json({ transaction: data });
}
