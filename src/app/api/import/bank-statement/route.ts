import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { categorize, planImport, statementTransactionId, type ParsedStatement } from "@/lib/statement-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

const transactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite(),
  description: z.string().min(1).max(300),
  reference: z.string().max(80),
  section: z.string().min(1).max(80),
  occurrence: z.number().int().min(0),
});

const statementSchema = z.object({
  bank: z.literal("Comerica"),
  accountLast4: z.string().max(8).nullable(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  beginningBalance: z.number().finite(),
  endingBalance: z.number().finite(),
  transactions: z.array(transactionSchema).max(2000),
  problems: z.array(z.string()),
});

const bodySchema = z.object({
  account_id: z.string().uuid(),
  statements: z.array(statementSchema).min(1).max(120),
  // true: only report what would happen.
  dry_run: z.boolean(),
});

const cents = (n: number) => Math.round(n * 100);

/**
 * Adds the transactions from parsed statements to a connected account's
 * history, skipping any already imported and any the bank already synced
 * (same amount within a few days). With dry_run, only says what it would do.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { account_id, statements, dry_run } = parsed.data as { account_id: string; statements: ParsedStatement[]; dry_run: boolean };

  // Only statements that checked out, and still add up here.
  const bad = statements.filter(
    (s) =>
      s.problems.length > 0 ||
      cents(s.beginningBalance) + s.transactions.reduce((sum, t) => sum + cents(t.amount), 0) !== cents(s.endingBalance)
  );
  if (bad.length > 0) {
    return NextResponse.json(
      { error: `${bad.length} statement${bad.length === 1 ? "" : "s"} didn't add up and can't be imported` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("id, type, iso_currency_code")
    .eq("id", account_id)
    .maybeSingle();
  if (accountError || !account) return NextResponse.json({ error: "That account wasn't found" }, { status: 404 });
  if (account.type !== "depository") {
    return NextResponse.json({ error: "Statements can only be added to a checking or savings account" }, { status: 400 });
  }

  const existing = await fetchAllRows<{ plaid_transaction_id: string; date: string; amount: number }>((from, to) =>
    admin
      .from("transactions")
      .select("plaid_transaction_id, date, amount")
      .eq("account_id", account_id)
      .order("id")
      .range(from, to)
  );
  if (existing.error) {
    console.error("Failed to read the account's transactions", existing.error);
    return NextResponse.json({ error: "Couldn't check for overlap with what's already there" }, { status: 500 });
  }

  const rows = statements.flatMap((s) =>
    s.transactions.map((t) => ({
      id: statementTransactionId(s, t),
      date: t.date,
      // The ledger's sign: money out is positive.
      amount: -t.amount,
      statement: s,
      transaction: t,
    }))
  );
  const plan = planImport(
    rows,
    (existing.data ?? []).map((e) => ({ ...e, amount: Number(e.amount) }))
  );

  const summary = {
    statements: statements.length,
    transactions: rows.length,
    toAdd: plan.toAdd.length,
    alreadyImported: plan.alreadyImported.length,
    alreadySynced: plan.matchedSynced.length,
    firstDate: rows.reduce<string | null>((min, r) => (min === null || r.date < min ? r.date : min), null),
    lastDate: rows.reduce<string | null>((max, r) => (max === null || r.date > max ? r.date : max), null),
  };
  if (dry_run || plan.toAdd.length === 0) return NextResponse.json({ ...summary, added: 0 });

  const now = new Date().toISOString();
  const records = plan.toAdd.map((r) => ({
    account_id,
    plaid_transaction_id: r.id,
    amount: r.amount,
    iso_currency_code: account.iso_currency_code ?? "USD",
    date: r.date,
    name: r.transaction.description,
    ...categorize(r.transaction),
    payment_channel: /card/i.test(r.transaction.section) ? "in store" : "other",
    pending: false,
    // Old history: never pushed as a new transaction.
    notified_at: now,
    raw: {
      source: "bank_statement",
      bank: r.statement.bank,
      account_last4: r.statement.accountLast4,
      statement_period: [r.statement.periodStart, r.statement.periodEnd],
      section: r.transaction.section,
      reference: r.transaction.reference,
    },
  }));

  for (let i = 0; i < records.length; i += 500) {
    const { error } = await admin
      .from("transactions")
      .upsert(records.slice(i, i + 500), { onConflict: "plaid_transaction_id", ignoreDuplicates: true });
    if (error) {
      console.error("Failed to add statement transactions", error);
      return NextResponse.json(
        { error: `Added ${i} of ${records.length} before an error; importing again picks up where it stopped` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ...summary, added: records.length });
}
