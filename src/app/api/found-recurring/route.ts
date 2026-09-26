import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { applyFoundAction } from "@/lib/found-recurring";
import { createAdminClient } from "@/lib/supabase/admin";
import { FOUND_RECURRING_KEY, loadFoundRecurring } from "@/lib/ui-preferences";

const bodySchema = z.object({
  key: z.string().min(1).max(200),
  action: z.enum(["dismiss", "restore"]),
});

/** Say a found recurring charge isn't a subscription, or undo that. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { prefs, error: loadError } = await loadFoundRecurring(admin);
  // Saving over what couldn't be read would lose it.
  if (loadError) return NextResponse.json({ error: "Couldn't read your recurring charges" }, { status: 500 });

  const value = applyFoundAction(prefs, parsed.data);
  const { error } = await admin.from("ui_preferences").upsert({ key: FOUND_RECURRING_KEY, value }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save found recurring charges", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
