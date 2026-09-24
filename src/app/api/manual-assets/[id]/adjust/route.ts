import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { adjustedCash } from "@/lib/cash-adjust";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  direction: z.enum(["add", "subtract"]),
  amount: z.number().positive().max(1_000_000_000),
});

/**
 * Adds to or takes from a cash entry's value. The change is applied to the
 * value as stored now, not to whatever the page last showed, and only if it
 * hasn't changed in between (another tab); if it has, it's tried again on
 * the new value.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: asset, error: readError } = await admin
      .from("manual_assets")
      .select("value, category")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("Failed to read manual asset", readError);
      return NextResponse.json({ error: "Failed to update the balance" }, { status: 500 });
    }
    if (!asset) return NextResponse.json({ error: "That entry wasn't found" }, { status: 404 });
    if (asset.category !== "cash") {
      return NextResponse.json({ error: "Only cash entries can be added to or taken from" }, { status: 400 });
    }

    const current = Number(asset.value);
    const result = adjustedCash(current, parsed.data.direction, parsed.data.amount);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    const { data: updated, error } = await admin
      .from("manual_assets")
      .update({ value: result.value })
      .eq("id", id)
      .eq("value", asset.value)
      .select("value");
    if (error) {
      console.error("Failed to update manual asset", error);
      return NextResponse.json({ error: "Failed to update the balance" }, { status: 500 });
    }
    if (updated && updated.length > 0) return NextResponse.json({ ok: true, previous: current, value: result.value });
  }

  return NextResponse.json({ error: "The balance changed while saving. Try again." }, { status: 409 });
}
