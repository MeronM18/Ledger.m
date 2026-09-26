import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { applyReviewAction } from "@/lib/subscription-review";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBSCRIPTION_REVIEW_KEY, loadSubscriptionReview } from "@/lib/ui-preferences";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const entryKey = z.string().regex(/^(plaid|manual|found)-.{1,190}$/);
const money = z.number().positive().max(1_000_000);

const bodySchema = z.discriminatedUnion("action", [
  // Cancelled on a day: charges after it are flagged.
  z.object({ action: z.literal("cancel"), key: entryKey, on: isoDate }),
  z.object({ action: z.literal("uncancel"), key: entryKey }),
  // A charge after a cancel that you expected.
  z.object({ action: z.literal("acknowledge"), key: entryKey, date: isoDate, amount: money }),
  // A first charge that isn't a subscription.
  z.object({ action: z.literal("dismiss-new"), name: z.string().min(1).max(200), date: isoDate, amount: money }),
  // A found one that looks right.
  z.object({ action: z.literal("confirm"), key: entryKey }),
]);

/**
 * Your answers about subscriptions. Cancelling (or undoing it) also sets
 * the entry's own flag, so the bank's copy and one you added read the same
 * everywhere.
 */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const body = parsed.data;

  const admin = createAdminClient();
  const { prefs, error: loadError } = await loadSubscriptionReview(admin);
  // Saving over what couldn't be read would lose it.
  if (loadError) return NextResponse.json({ error: "Couldn't read your subscriptions" }, { status: 500 });

  if (body.action === "cancel" || body.action === "uncancel") {
    const cancelled = body.action === "cancel";
    const [, source, id] = body.key.match(/^(plaid|manual|found)-(.+)$/)!;
    const { error } =
      source === "plaid"
        ? await admin.from("recurring_streams").update({ user_marked_cancelled: cancelled }).eq("id", id)
        : source === "manual"
          ? await admin.from("manual_subscriptions").update({ is_active: !cancelled }).eq("id", id)
          : { error: null };
    if (error) {
      console.error("Failed to update the subscription", error);
      return NextResponse.json({ error: "Couldn't update the subscription" }, { status: 500 });
    }
  }

  const value = applyReviewAction(prefs, body);
  const { error } = await admin.from("ui_preferences").upsert({ key: SUBSCRIPTION_REVIEW_KEY, value }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save subscription review", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
