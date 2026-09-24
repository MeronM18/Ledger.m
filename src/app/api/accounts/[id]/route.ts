import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCOUNT_SETTINGS_KEY, loadAccountSettings } from "@/lib/ui-preferences";

// What's editable on a connected account: the yield (sync never touches
// apy), and a name and card statement days of your own, which live in
// ui_preferences so a sync can't overwrite them.
const day = z.number().int().min(1).max(31).nullable();
const bodySchema = z
  .object({
    apy: z.number().min(0).max(100).nullable(),
    nickname: z.string().trim().max(60).nullable(),
    statement_close_day: day,
    payment_due_day: day,
  })
  .partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: account } = await admin.from("accounts").select("id").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  if (parsed.data.apy !== undefined) {
    const { error } = await admin.from("accounts").update({ apy: parsed.data.apy }).eq("id", id);
    if (error) {
      console.error("Failed to update account APY", error);
      return NextResponse.json({ error: "Failed to update APY" }, { status: 500 });
    }
  }

  const { nickname, statement_close_day, payment_due_day } = parsed.data;
  if (nickname !== undefined || statement_close_day !== undefined || payment_due_day !== undefined) {
    const all = await loadAccountSettings(admin);
    const current = all[id] ?? {};
    all[id] = {
      nickname: nickname !== undefined ? nickname || null : (current.nickname ?? null),
      statementCloseDay: statement_close_day !== undefined ? statement_close_day : (current.statementCloseDay ?? null),
      paymentDueDay: payment_due_day !== undefined ? payment_due_day : (current.paymentDueDay ?? null),
    };
    const { error } = await admin.from("ui_preferences").upsert({ key: ACCOUNT_SETTINGS_KEY, value: all }, { onConflict: "key" });
    if (error) {
      console.error("Failed to save account settings", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
