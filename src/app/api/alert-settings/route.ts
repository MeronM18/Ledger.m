import { NextResponse } from "next/server";
import { z } from "zod";
import { ALERT_SETTING_KINDS } from "@/lib/alert-settings";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALERT_SETTINGS_KEY, loadAlertSettings } from "@/lib/ui-preferences";

const bodySchema = z.object({
  kind: z.enum(ALERT_SETTING_KINDS as [string, ...string[]]),
  enabled: z.boolean(),
});

/** Switches one kind of push on or off, leaving the rest as they are. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const settings = { ...(await loadAlertSettings(admin)), [parsed.data.kind]: parsed.data.enabled };
  const { error } = await admin.from("ui_preferences").upsert({ key: ALERT_SETTINGS_KEY, value: settings }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save alert settings", error);
    return NextResponse.json({ error: "Failed to save the setting" }, { status: 500 });
  }
  return NextResponse.json({ settings });
}
