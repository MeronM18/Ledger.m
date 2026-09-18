import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TODO(phase-2): verify the Plaid-Verification JWT header before trusting the
// payload. See https://plaid.com/docs/api/webhooks/webhook-verification/
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("webhook_events").insert({
    webhook_type: payload.webhook_type ?? null,
    webhook_code: payload.webhook_code ?? null,
    plaid_item_id: payload.item_id ?? null,
    payload,
  });

  if (error) {
    console.error("Failed to record Plaid webhook event", error);
  }

  return NextResponse.json({ received: true });
}
