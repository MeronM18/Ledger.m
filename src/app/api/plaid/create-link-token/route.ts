import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { PLAID_COUNTRY_CODES, PLAID_PRODUCTS, plaidClient } from "@/lib/plaid";

export async function POST() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  try {
    const response = await plaidClient.linkTokenCreate({
      client_name: "Ledger.m",
      language: "en",
      country_codes: PLAID_COUNTRY_CODES,
      products: PLAID_PRODUCTS,
      user: {
        client_user_id: auth.user.id,
      },
      webhook: env.PLAID_WEBHOOK_URL || undefined,
      transactions: {
        days_requested: 730,
      },
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("Failed to create Plaid link token", err);
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
