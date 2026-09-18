import { NextResponse } from "next/server";
import { verifyPlaidWebhook } from "@/lib/plaid-webhook";
import { syncItemRecurring, syncItemTransactions } from "@/lib/plaid-sync";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface PlaidWebhookPayload {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string; error_message?: string } | null;
}

async function resolveItemDbId(admin: AdminClient, plaidItemId: string | undefined) {
  if (!plaidItemId) return null;
  const { data } = await admin
    .from("items")
    .select("id")
    .eq("plaid_item_id", plaidItemId)
    .maybeSingle();
  return data?.id ?? null;
}

async function handleItemErrorWebhook(
  admin: AdminClient,
  itemDbId: string,
  error: PlaidWebhookPayload["error"]
) {
  const errorCode = error?.error_code ?? "UNKNOWN_ERROR";
  const status = errorCode === "ITEM_LOGIN_REQUIRED" ? "requires_reauth" : "error";
  await admin.from("items").update({ status, error_code: errorCode }).eq("id", itemDbId);
}

/**
 * Always returns 200: per Plaid's webhook docs, a non-200 response (or none
 * within 10s) causes Plaid to keep retrying for up to 24h. Verification
 * failures and processing errors are logged to webhook_events instead of
 * being surfaced as an HTTP error, so a bad/replayed webhook doesn't trigger
 * a retry storm.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verificationHeader = request.headers.get("Plaid-Verification");

  let payload: PlaidWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }

  const admin = createAdminClient();

  if (!payload) {
    await admin.from("webhook_events").insert({
      webhook_type: null,
      webhook_code: null,
      plaid_item_id: null,
      payload: { raw: rawBody },
      verified: false,
      error: "Invalid JSON payload",
      processed_at: new Date().toISOString(),
    });
    return NextResponse.json({ received: true });
  }

  const verification = await verifyPlaidWebhook(rawBody, verificationHeader);

  const { data: eventRow, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      webhook_type: payload.webhook_type ?? null,
      webhook_code: payload.webhook_code ?? null,
      plaid_item_id: payload.item_id ?? null,
      payload,
      verified: verification.verified,
    })
    .select("id")
    .single();

  if (insertError || !eventRow) {
    console.error("Failed to record Plaid webhook event", insertError);
    return NextResponse.json({ received: true });
  }

  if (!verification.verified) {
    console.error(`Rejected unverified Plaid webhook: ${verification.reason}`);
    await admin
      .from("webhook_events")
      .update({ error: `Verification failed: ${verification.reason}`, processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);
    return NextResponse.json({ received: true });
  }

  let processingError: string | null = null;

  try {
    const itemDbId = await resolveItemDbId(admin, payload.item_id);

    if (!itemDbId) {
      processingError = `Unknown item_id: ${payload.item_id ?? "(missing)"}`;
    } else if (payload.webhook_type === "TRANSACTIONS" && payload.webhook_code === "SYNC_UPDATES_AVAILABLE") {
      const result = await syncItemTransactions(itemDbId);
      if (!result.ok) processingError = result.error;
    } else if (
      payload.webhook_type === "TRANSACTIONS" &&
      payload.webhook_code === "RECURRING_TRANSACTIONS_UPDATE"
    ) {
      const result = await syncItemRecurring(itemDbId);
      if (!result.ok) processingError = result.error;
    } else if (payload.webhook_type === "ITEM" && payload.webhook_code === "ERROR") {
      await handleItemErrorWebhook(admin, itemDbId, payload.error);
    } else if (
      payload.webhook_type === "ITEM" &&
      (payload.webhook_code === "PENDING_EXPIRATION" || payload.webhook_code === "PENDING_DISCONNECT")
    ) {
      await admin
        .from("items")
        .update({ status: payload.webhook_code.toLowerCase() })
        .eq("id", itemDbId);
    }
    // Other webhook codes (NEW_ACCOUNTS_AVAILABLE, LOGIN_REPAIRED, etc.) are
    // recorded above but not acted on yet.
  } catch (err) {
    processingError = err instanceof Error ? err.message : String(err);
    console.error("Failed to process Plaid webhook", err);
  }

  await admin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString(), error: processingError })
    .eq("id", eventRow.id);

  return NextResponse.json({ received: true });
}
