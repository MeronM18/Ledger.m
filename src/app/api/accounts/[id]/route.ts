import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REWARDS_CHOICES } from "@/lib/account-settings";
import { calendarNow } from "@/lib/time";
import { ACCOUNT_SETTINGS_KEY, loadAccountSettings } from "@/lib/ui-preferences";

// What's editable on a connected account: the yield and whether it's
// hidden (sync never touches either), and a name and card statement days of
// your own, which live in ui_preferences so a sync can't overwrite them.
const day = z.number().int().min(1).max(31).nullable();
const bodySchema = z
  .object({
    apy: z.number().min(0).max(100).nullable(),
    // Hidden accounts are left out of net worth, the Overview, alerts, goals and the forecast.
    is_hidden: z.boolean(),
    nickname: z.string().trim().max(60).nullable(),
    statement_close_day: day,
    payment_due_day: day,
    rewards_program: z.enum(REWARDS_CHOICES).nullable(),
    // The card's points as its app shows them; today becomes the date they're as of.
    rewards_balance: z
      .object({ available: z.number().min(0).max(1_000_000_000), pending: z.number().min(0).max(1_000_000_000) })
      .nullable(),
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

  if (parsed.data.is_hidden !== undefined) {
    const { error } = await admin.from("accounts").update({ is_hidden: parsed.data.is_hidden }).eq("id", id);
    if (error) {
      console.error("Failed to update whether the account is hidden", error);
      return NextResponse.json({ error: "Failed to update the account" }, { status: 500 });
    }
  }

  if (parsed.data.apy !== undefined) {
    const { error } = await admin.from("accounts").update({ apy: parsed.data.apy }).eq("id", id);
    if (error) {
      console.error("Failed to update account APY", error);
      return NextResponse.json({ error: "Failed to update APY" }, { status: 500 });
    }
  }

  const { nickname, statement_close_day, payment_due_day, rewards_program, rewards_balance } = parsed.data;
  if (
    nickname !== undefined ||
    statement_close_day !== undefined ||
    payment_due_day !== undefined ||
    rewards_program !== undefined ||
    rewards_balance !== undefined
  ) {
    const all = await loadAccountSettings(admin);
    const current = all[id] ?? {};
    all[id] = {
      nickname: nickname !== undefined ? nickname || null : (current.nickname ?? null),
      statementCloseDay: statement_close_day !== undefined ? statement_close_day : (current.statementCloseDay ?? null),
      paymentDueDay: payment_due_day !== undefined ? payment_due_day : (current.paymentDueDay ?? null),
      rewardsProgram: rewards_program !== undefined ? rewards_program : (current.rewardsProgram ?? null),
      rewardsBalance:
        rewards_balance === undefined
          ? (current.rewardsBalance ?? null)
          : rewards_balance && { available: Math.round(rewards_balance.available), pending: Math.round(rewards_balance.pending), asOf: calendarNow().isoDate },
    };
    const { error } = await admin.from("ui_preferences").upsert({ key: ACCOUNT_SETTINGS_KEY, value: all }, { onConflict: "key" });
    if (error) {
      console.error("Failed to save account settings", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
