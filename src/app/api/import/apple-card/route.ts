import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { parseAppleCsv } from "@/lib/apple-card-import";
import { createAdminClient } from "@/lib/supabase/admin";

// A statement export is tens of kilobytes; 5 MB is far past any real one.
const MAX_CSV_CHARS = 5_000_000;
const CHUNK = 200;

const bodySchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  // Apple Card: an optional credit limit.
  credit_limit: z.number().positive().max(10_000_000).optional(),
  // Apple Savings: today's balance. The export lists deposits but not the
  // balance, so it has to be given (required the first time).
  balance: z.number().min(0).max(100_000_000).optional(),
});

/**
 * One import for both Apple exports: the file's header says whether it's the
 * Apple Card or the Apple Savings export, and the matching account is found
 * or created.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { kind, transactions, skipped } = parseAppleCsv(parsedBody.data.csv);
  if (!kind || transactions.length === 0) {
    return NextResponse.json({ error: skipped[0]?.reason ?? "No transactions found in that file." }, { status: 400 });
  }

  const isCard = kind === "card";
  const institution = isCard ? "Apple Card" : "Apple Savings";
  const type = isCard ? "credit" : "depository";
  const admin = createAdminClient();

  let accountId: string;
  const { data: existing, error: findError } = await admin
    .from("manual_accounts")
    .select("id")
    .eq("institution_name", institution)
    .eq("type", type)
    .maybeSingle();
  if (findError) {
    console.error("Failed to look up the account", findError);
    return NextResponse.json({ error: "Failed to look up the account" }, { status: 500 });
  }

  if (existing) {
    accountId = existing.id;
    const update: Record<string, unknown> = {};
    if (isCard && parsedBody.data.credit_limit !== undefined) update.credit_limit = parsedBody.data.credit_limit;
    if (!isCard && parsedBody.data.balance !== undefined) update.balance_override = parsedBody.data.balance;
    if (Object.keys(update).length > 0) await admin.from("manual_accounts").update(update).eq("id", accountId);
  } else {
    if (!isCard && parsedBody.data.balance === undefined) {
      return NextResponse.json(
        { error: "Enter your current Apple Savings balance (it's in Wallet). The export lists deposits but not the balance." },
        { status: 400 }
      );
    }
    const { data: created, error: createError } = await admin
      .from("manual_accounts")
      .insert({
        name: institution,
        institution_name: institution,
        type,
        credit_limit: isCard ? (parsedBody.data.credit_limit ?? null) : null,
        balance_override: isCard ? null : (parsedBody.data.balance ?? null),
      })
      .select("id")
      .single();
    if (createError || !created) {
      console.error("Failed to create the account", createError);
      return NextResponse.json({ error: `Failed to create the ${institution} account` }, { status: 500 });
    }
    accountId = created.id;
  }

  let added = 0;
  for (let i = 0; i < transactions.length; i += CHUNK) {
    const rows = transactions.slice(i, i + CHUNK).map((t) => ({
      date: t.date,
      name: t.name,
      amount: t.amount,
      pfc_primary: t.pfc_primary,
      payment_method: institution,
      notes: t.notes,
      manual_account_id: accountId,
      external_id: t.external_id,
      source: isCard ? "apple_card_csv" : "apple_savings_csv",
    }));
    // Rows already imported (same external_id) are skipped, not duplicated.
    const { data, error } = await admin
      .from("manual_transactions")
      .upsert(rows, { onConflict: "manual_account_id,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("Failed to import Apple transactions", error);
      return NextResponse.json(
        { error: `Imported ${added} of ${transactions.length} before an error stopped it. Run it again to finish; nothing is duplicated.` },
        { status: 500 }
      );
    }
    added += data?.length ?? 0;
  }

  const dates = transactions.map((t) => t.date).sort();
  return NextResponse.json({
    ok: true,
    kind,
    account_id: accountId,
    total: transactions.length,
    added,
    alreadyThere: transactions.length - added,
    skipped: skipped.length,
    from: dates[0],
    to: dates[dates.length - 1],
  });
}
