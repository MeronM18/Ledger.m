import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { plaidClient } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase/admin";

// Plaid's answer when the connection is already gone on their side, so
// there's nothing left to remove there.
const ALREADY_GONE = new Set(["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"]);

/**
 * Disconnects a bank: Plaid stops syncing (and billing for) it, then its
 * accounts, transactions and recurring charges are deleted here. Your own
 * entries (manual transactions, imports, budgets, goals) stay.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: item, error: loadError } = await admin.from("items").select("id, access_token_encrypted").eq("id", id).maybeSingle();
  if (loadError) {
    console.error("Failed to load the connection to remove", loadError);
    return NextResponse.json({ error: "Couldn't load that connection" }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  try {
    await plaidClient.itemRemove({ access_token: decrypt(item.access_token_encrypted) });
  } catch (err) {
    const code = (err as { response?: { data?: { error_code?: string } } }).response?.data?.error_code;
    if (!code || !ALREADY_GONE.has(code)) {
      console.error("Plaid refused to remove the connection", code ?? err);
      return NextResponse.json({ error: "The bank connection couldn't be removed at Plaid. Try again in a minute." }, { status: 502 });
    }
  }

  // Accounts, and through them transactions and recurring streams, go with it (on delete cascade).
  const { error } = await admin.from("items").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete the connection", error);
    return NextResponse.json({ error: "Disconnected at Plaid, but its data couldn't be deleted here. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
