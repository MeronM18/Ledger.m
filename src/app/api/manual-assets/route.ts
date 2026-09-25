import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { startAssetValues } from "@/lib/asset-history";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";

const bodySchema = z.object({
  name: z.string().min(1),
  category: z.enum(["cash", "crypto", "vehicle", "property", "other"]),
  value: z.number(),
  is_liability: z.boolean().default(false),
  notes: z.string().optional().nullable(),
  // The day it's worth this from; it counts toward net worth from then. Today when left out.
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const today = calendarNow().isoDate;
  const { as_of, ...asset } = parsed.data;
  if (as_of && as_of > today) return NextResponse.json({ error: "The date can't be in the future" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("manual_assets")
    .insert(asset)
    .select()
    .single();

  if (error) {
    console.error("Failed to create manual asset", error);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }

  await startAssetValues(admin, data.id, as_of ?? today, asset.value);
  return NextResponse.json({ asset: data });
}
