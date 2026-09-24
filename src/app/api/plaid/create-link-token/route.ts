import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { PLAID_COUNTRY_CODES, PLAID_PRODUCTS, plaidClient } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  // Set to reconnect a bank that needs signing in again (Plaid's update
  // mode): Link reopens for that connection instead of adding a new one.
  item_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  // No body at all means a new connection.
  const text = await request.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let accessToken: string | undefined;
  if (parsed.data.item_id) {
    const { data: item, error } = await createAdminClient()
      .from("items")
      .select("access_token_encrypted")
      .eq("id", parsed.data.item_id)
      .maybeSingle();
    if (error || !item) {
      return NextResponse.json({ error: "That bank connection wasn't found" }, { status: 404 });
    }
    try {
      accessToken = decrypt(item.access_token_encrypted);
    } catch {
      return NextResponse.json({ error: "Couldn't read that bank connection" }, { status: 500 });
    }
  }

  try {
    const response = await plaidClient.linkTokenCreate({
      client_name: "Ledger.m",
      language: "en",
      country_codes: PLAID_COUNTRY_CODES,
      user: {
        client_user_id: auth.user.id,
      },
      webhook: env.PLAID_WEBHOOK_URL || undefined,
      // Update mode takes the existing access token and no products; a new
      // connection takes products and asks for two years of history.
      ...(accessToken
        ? { access_token: accessToken }
        : { products: PLAID_PRODUCTS, transactions: { days_requested: 730 } }),
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("Failed to create Plaid link token", err);
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
