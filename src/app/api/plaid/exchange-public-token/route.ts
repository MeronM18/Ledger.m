import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { plaidClient } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  public_token: z.string().min(1),
  institution_id: z.string().nullable(),
  institution_name: z.string().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { public_token, institution_id, institution_name } = parsed.data;

  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResponse.data;

    const accessTokenEncrypted = encrypt(access_token);
    const admin = createAdminClient();

    const { data: item, error: itemError } = await admin
      .from("items")
      .upsert(
        {
          plaid_item_id: item_id,
          access_token_encrypted: accessTokenEncrypted,
          institution_id,
          institution_name,
          status: "active",
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "plaid_item_id" }
      )
      .select("id")
      .single();

    if (itemError || !item) {
      throw itemError ?? new Error("Failed to upsert item");
    }

    const accountsResponse = await plaidClient.accountsGet({ access_token });

    const accountRows = accountsResponse.data.accounts.map((account) => ({
      item_id: item.id,
      plaid_account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      current_balance: account.balances.current,
      available_balance: account.balances.available,
      credit_limit: account.balances.limit,
      iso_currency_code: account.balances.iso_currency_code,
    }));

    const { error: accountsError } = await admin
      .from("accounts")
      .upsert(accountRows, { onConflict: "plaid_account_id" });

    if (accountsError) {
      throw accountsError;
    }

    return NextResponse.json({ ok: true, accounts_linked: accountRows.length });
  } catch (err) {
    console.error("Failed to exchange Plaid public token", err);
    return NextResponse.json({ error: "Failed to link account" }, { status: 500 });
  }
}
