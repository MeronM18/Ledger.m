import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { monthlyBudgetError } from "@/lib/budgets";
import { createAdminClient } from "@/lib/supabase/admin";
import { MONTHLY_BUDGET_KEY } from "@/lib/ui-preferences";

const bodySchema = z.object({
  // Null takes the monthly budget away; the category budgets stay.
  amount: z.number().positive().max(10_000_000).nullable(),
});

/** Sets the monthly spending budget. It has to cover the category budgets already set. */
export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { amount } = parsed.data;

  if (amount === null) {
    const { error } = await admin.from("ui_preferences").delete().eq("key", MONTHLY_BUDGET_KEY);
    if (error) {
      console.error("Failed to remove the monthly budget", error);
      return NextResponse.json({ error: "Failed to remove the monthly budget" }, { status: 500 });
    }
    return NextResponse.json({ amount: null });
  }

  const { data: budgets, error: readError } = await admin.from("budgets").select("id, category, monthly_amount");
  if (readError) {
    console.error("Failed to read budgets before saving the monthly budget", readError);
    return NextResponse.json({ error: "Failed to save the monthly budget" }, { status: 500 });
  }
  const tooLow = monthlyBudgetError(
    amount,
    (budgets ?? []).map((b) => ({ id: b.id, category: b.category, monthly_amount: Number(b.monthly_amount) }))
  );
  if (tooLow) return NextResponse.json({ error: tooLow }, { status: 400 });

  const value = { amount: Math.round(amount * 100) / 100 };
  const { error } = await admin.from("ui_preferences").upsert({ key: MONTHLY_BUDGET_KEY, value }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save the monthly budget", error);
    return NextResponse.json({ error: "Failed to save the monthly budget" }, { status: 500 });
  }
  return NextResponse.json(value);
}
