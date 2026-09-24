import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALERTS_SEEN_KEY, loadAlertsSeenAt } from "@/lib/ui-preferences";

const bodySchema = z.object({
  // The newest alert the bell showed. Not "now": an alert that arrived
  // after the list was loaded hasn't been seen yet.
  seen_through: z.string().datetime({ offset: true }),
});

/** Marks alerts up to `seen_through` as seen, so the bell's count clears. Never moves backwards. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const admin = createAdminClient();
  const current = await loadAlertsSeenAt(admin);
  if (current && Date.parse(current) >= Date.parse(parsed.data.seen_through)) return NextResponse.json({ ok: true });

  const { error } = await admin
    .from("ui_preferences")
    .upsert({ key: ALERTS_SEEN_KEY, value: parsed.data.seen_through }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save when alerts were seen", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
