import { NextResponse } from "next/server";
import { z } from "zod";
import { DISPLAY_NAME_MAX, THRESHOLD_LIMITS } from "@/lib/app-preferences";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALERT_THRESHOLDS_KEY, DISPLAY_NAME_KEY, loadAlertThresholds } from "@/lib/ui-preferences";

const limit = (key: keyof typeof THRESHOLD_LIMITS) => z.number().min(THRESHOLD_LIMITS[key].min).max(THRESHOLD_LIMITS[key].max);

const bodySchema = z
  .object({
    // Blank or null goes back to the default greeting.
    displayName: z.string().trim().max(DISPLAY_NAME_MAX).nullable(),
    thresholds: z
      .object({
        largeCharge: limit("largeCharge"),
        lowBalance: limit("lowBalance"),
        renewalDaysAhead: limit("renewalDaysAhead").int(),
      })
      .partial(),
  })
  .partial();

/** Saves your name and alert thresholds from the Settings page; anything left out stays as it is. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the values and try again" }, { status: 400 });
  }

  const admin = createAdminClient();
  const rows: { key: string; value: unknown }[] = [];
  if (parsed.data.displayName !== undefined) rows.push({ key: DISPLAY_NAME_KEY, value: parsed.data.displayName || null });
  if (parsed.data.thresholds) rows.push({ key: ALERT_THRESHOLDS_KEY, value: { ...(await loadAlertThresholds(admin)), ...parsed.data.thresholds } });
  if (rows.length === 0) return NextResponse.json({ ok: true });

  const { error } = await admin.from("ui_preferences").upsert(rows, { onConflict: "key" });
  if (error) {
    console.error("Failed to save settings", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
