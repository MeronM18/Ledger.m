import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { removeAssetValue } from "@/lib/asset-history";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Takes one day's value out of an asset's history (a mistyped value or
 * date), and sets what it's worth now to the latest one left.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Pick a day to remove" }, { status: 400 });

  const admin = createAdminClient();
  const { data: asset, error: readError } = await admin.from("manual_assets").select("id, value, created_at, updated_at").eq("id", id).maybeSingle();
  if (readError) {
    console.error("Failed to read manual asset", readError);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
  if (!asset) return NextResponse.json({ error: "That asset wasn't found" }, { status: 404 });

  const result = await removeAssetValue(admin, { ...asset, value: Number(asset.value) }, date);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const { error } = await admin.from("manual_assets").update({ value: result.value }).eq("id", id);
  if (error) {
    console.error("Failed to update manual asset", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, value: result.value });
}
