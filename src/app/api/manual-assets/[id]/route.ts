import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { forgetAssetValues, recordAssetValue } from "@/lib/asset-history";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

const bodySchema = z.object({
  name: z.string().min(1),
  category: z.enum(["cash", "crypto", "vehicle", "property", "other"]),
  value: z.number(),
  is_liability: z.boolean(),
  notes: z.string().optional().nullable(),
  // The day the value is from: today, or a day in the past to fill in history.
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const today = calendarNow().isoDate;
  const { as_of, value, ...fields } = parsed.data;
  if (as_of && as_of > today) return NextResponse.json({ error: "The date can't be in the future" }, { status: 400 });

  const admin = createAdminClient();
  const { data: before, error: readError } = await admin.from("manual_assets").select("id, value, created_at, updated_at").eq("id", id).maybeSingle();
  if (readError) {
    console.error("Failed to read manual asset", readError);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
  if (!before) return NextResponse.json({ error: "That asset wasn't found" }, { status: 404 });

  // The value goes into its history on its day; what it's worth now is the
  // latest there, so a value from the past doesn't replace today's.
  const now = await recordAssetValue(admin, { ...before, value: Number(before.value) }, as_of ?? today, value);
  const { error } = await admin.from("manual_assets").update({ ...fields, value: now }).eq("id", id);

  if (error) {
    console.error("Failed to update manual asset", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, value: now });
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

  await forgetAssetValues(admin, id);
  return NextResponse.json({ ok: true });
}
