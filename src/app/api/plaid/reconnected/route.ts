import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { syncItemTransactions } from "@/lib/plaid-sync";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ item_id: z.string().uuid() });

/**
 * Called after a successful sign-in through Plaid's update mode. The
 * connection keeps its access token (nothing to exchange), so this marks it
 * healthy again and syncs right away to catch up on what was missed.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("items")
    .update({ status: "active", error_code: null })
    .eq("id", parsed.data.item_id);
  if (error) {
    console.error("Failed to mark item reconnected", error);
    return NextResponse.json({ error: "Failed to update the connection" }, { status: 500 });
  }

  const result = await syncItemTransactions(parsed.data.item_id);
  return NextResponse.json({ result });
}
