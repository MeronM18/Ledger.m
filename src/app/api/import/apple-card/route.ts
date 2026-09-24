import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { parseAppleCardCsv } from "@/lib/apple-card-import";
import { createAdminClient } from "@/lib/supabase/admin";

// A statement export is tens of kilobytes; 5 MB is far past any real one.
const MAX_CSV_CHARS = 5_000_000;
const CHUNK = 200;

const bodySchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  // Import into an existing Apple Card account, or create one (with an
  // optional credit limit) when none is given.
  account_id: z.string().uuid().optional(),
  credit_limit: z.number().positive().max(10_000_000).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { transactions, skipped } = parseAppleCardCsv(parsedBody.data.csv);
  if (transactions.length === 0) {
    return NextResponse.json({ error: skipped[0]?.reason ?? "No transactions found in that file." }, { status: 400 });
  }

  const admin = createAdminClient();

  let accountId = parsedBody.data.account_id;
  if (!accountId) {
    const { data: existing } = await admin
      .from("manual_accounts")
      .select("id")
      .eq("institution_name", "Apple Card")
      .maybeSingle();
    if (existing) {
      accountId = existing.id;
    } else {
      const { data: created, error: createError } = await admin
        .from("manual_accounts")
        .insert({
          name: "Apple Card",
          institution_name: "Apple Card",
          type: "credit",
          credit_limit: parsedBody.data.credit_limit ?? null,
        })
        .select("id")
        .single();
      if (createError || !created) {
        console.error("Failed to create Apple Card account", createError);
        return NextResponse.json({ error: "Failed to create the Apple Card account" }, { status: 500 });
      }
      accountId = created.id;
    }
  } else if (parsedBody.data.credit_limit !== undefined) {
    await admin.from("manual_accounts").update({ credit_limit: parsedBody.data.credit_limit }).eq("id", accountId);
  }

  let added = 0;
  for (let i = 0; i < transactions.length; i += CHUNK) {
    const rows = transactions.slice(i, i + CHUNK).map((t) => ({
      date: t.date,
      name: t.name,
      amount: t.amount,
      pfc_primary: t.pfc_primary,
      payment_method: "Apple Card",
      notes: t.notes,
      manual_account_id: accountId,
      external_id: t.external_id,
      source: "apple_card_csv",
    }));
    // Rows already imported (same external_id) are skipped, not duplicated.
    const { data, error } = await admin
      .from("manual_transactions")
      .upsert(rows, { onConflict: "manual_account_id,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("Failed to import Apple Card transactions", error);
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
    account_id: accountId,
    total: transactions.length,
    added,
    alreadyThere: transactions.length - added,
    skipped: skipped.length,
    from: dates[0],
    to: dates[dates.length - 1],
  });
}
