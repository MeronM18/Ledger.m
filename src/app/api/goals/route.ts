import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// "plaid:<uuid>" or "manual:<uuid>"; a handful at most.
const accountRefsSchema = z
  .array(z.string().regex(/^(plaid|manual):[0-9a-f-]{36}$/))
  .max(10);

const goalBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  target_amount: z.number().positive().max(100_000_000),
  saved_amount: z.number().min(0).max(100_000_000).default(0),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  account_refs: accountRefsSchema.optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = goalBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("savings_goals")
    .insert({
      name: parsed.data.name,
      target_amount: parsed.data.target_amount,
      saved_amount: parsed.data.saved_amount,
      target_date: parsed.data.target_date ?? null,
      account_refs: parsed.data.account_refs ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create savings goal", error);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }

  return NextResponse.json({ goal: data });
}
