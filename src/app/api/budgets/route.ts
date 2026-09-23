import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { BUDGETABLE_CATEGORIES } from "@/lib/budgets";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  category: z.enum(BUDGETABLE_CATEGORIES as [string, ...string[]]),
  monthly_amount: z.number().positive().max(10_000_000),
});

// Upsert: one budget per category, so setting it again just changes the amount.
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("budgets")
    .upsert(parsed.data, { onConflict: "category" })
    .select()
    .single();

  if (error) {
    console.error("Failed to save budget", error);
    return NextResponse.json({ error: "Failed to save budget" }, { status: 500 });
  }

  return NextResponse.json({ budget: data });
}
