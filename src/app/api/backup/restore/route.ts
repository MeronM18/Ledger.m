import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { planRestore, RESTORED_TABLES, type RestorePayload } from "@/lib/backup-restore";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

const row = z.record(z.string(), z.unknown());
const bodySchema = z.object({
  payload: z.object({
    exportedAt: z.string().nullable(),
    tables: z.record(z.enum(RESTORED_TABLES as [string, ...string[]]), z.array(row).max(100_000)),
    transactions: z.array(z.object({ id: z.string(), plaid_transaction_id: z.string() })).max(200_000),
    accounts: z.array(z.object({ id: z.string(), plaid_account_id: z.string() })).max(1_000),
  }),
  // true: only say what would be restored.
  dry_run: z.boolean(),
});

const CHUNK = 500;

/**
 * Restores what you made from a backup file (see lib/backup-restore.ts):
 * merging, never deleting. With dry_run it only reports what it would do.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That file couldn't be read as a Ledger.m backup." }, { status: 400 });

  const admin = createAdminClient();
  const [txRes, accountsRes] = await Promise.all([
    fetchAllRows<{ id: string; plaid_transaction_id: string }>((from, to) =>
      admin.from("transactions").select("id, plaid_transaction_id").order("id").range(from, to)
    ),
    admin.from("accounts").select("id, plaid_account_id"),
  ]);
  if (txRes.error || accountsRes.error) {
    console.error("Restore couldn't read current transactions or accounts", txRes.error ?? accountsRes.error);
    return NextResponse.json({ error: "Couldn't read your current data to match against. Nothing was changed." }, { status: 500 });
  }

  const plan = planRestore(parsed.data.payload as RestorePayload, {
    transactionIdByPlaid: new Map((txRes.data ?? []).map((t) => [t.plaid_transaction_id, t.id])),
    accountIdByPlaid: new Map((accountsRes.data ?? []).map((a) => [a.plaid_account_id as string, a.id as string])),
  });

  if (parsed.data.dry_run) {
    return NextResponse.json({ exportedAt: plan.exportedAt, counts: plan.counts, unmatchedEdits: plan.unmatchedEdits });
  }

  const written: Record<string, number> = {};
  for (const step of plan.steps) {
    for (let i = 0; i < step.rows.length; i += CHUNK) {
      const { error } = await admin
        .from(step.table)
        .upsert(step.rows.slice(i, i + CHUNK), { onConflict: step.onConflict, ignoreDuplicates: step.keepExisting ?? false });
      if (error) {
        console.error(`Restore failed writing ${step.table}`, error);
        return NextResponse.json(
          {
            error: `Stopped while restoring ${step.table.replace(/_/g, " ")}. What came before it was restored; running the restore again is safe.`,
            written,
          },
          { status: 500 }
        );
      }
      written[step.table] = (written[step.table] ?? 0) + Math.min(CHUNK, step.rows.length - i);
    }
  }

  return NextResponse.json({ ok: true, written, unmatchedEdits: plan.unmatchedEdits });
}
