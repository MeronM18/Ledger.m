import { NextResponse } from "next/server";
import { SandboxItemFireWebhookRequestWebhookCodeEnum } from "plaid";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { plaidClient } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase/admin";

// Sandbox-only convenience for the acceptance-test workflow: fires a real
// Plaid test webhook at whichever URL the item was linked with (Plaid calls
// it over the network — this only reaches your app if PLAID_WEBHOOK_URL was
// a publicly reachable address, e.g. a tunnel, when the item was linked).
const bodySchema = z.object({
  item_id: z.string().uuid(),
  webhook_code: z
    .enum(["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "RECURRING_TRANSACTIONS_UPDATE", "ERROR"])
    .default("SYNC_UPDATES_AVAILABLE"),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  if (env.PLAID_ENV !== "sandbox") {
    return NextResponse.json({ error: "Only available in Sandbox" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: item, error } = await admin
    .from("items")
    .select("access_token_encrypted")
    .eq("id", parsed.data.item_id)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  try {
    const accessToken = decrypt(item.access_token_encrypted);
    const response = await plaidClient.sandboxItemFireWebhook({
      access_token: accessToken,
      webhook_code: parsed.data.webhook_code as SandboxItemFireWebhookRequestWebhookCodeEnum,
    });
    return NextResponse.json(response.data);
  } catch (err) {
    console.error("Failed to fire sandbox webhook", err);
    return NextResponse.json({ error: "Failed to fire sandbox webhook" }, { status: 500 });
  }
}
