import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { calendarNow } from "@/lib/time";

// Everything the app knows, table by table. Left out on purpose: bank
// access tokens and sync cursors (secrets, and useless outside this app),
// Plaid's raw payload copies (large, and every useful field is already its
// own column) and the webhook log.
const TABLES: { table: string; select: string; orderBy: string }[] = [
  { table: "items", select: "id, institution_id, institution_name, status, error_code, last_synced_at, created_at", orderBy: "created_at" },
  { table: "accounts", select: "*", orderBy: "id" },
  {
    table: "transactions",
    select:
      "id, account_id, plaid_transaction_id, amount, iso_currency_code, date, authorized_date, datetime, name, merchant_name, logo_url, website, pfc_primary, pfc_detailed, pfc_confidence, payment_channel, pending, pending_transaction_id, created_at",
    orderBy: "id",
  },
  { table: "transaction_overrides", select: "*", orderBy: "transaction_id" },
  { table: "merchant_rules", select: "*", orderBy: "id" },
  { table: "manual_transactions", select: "*", orderBy: "id" },
  { table: "manual_accounts", select: "*", orderBy: "id" },
  { table: "manual_subscriptions", select: "*", orderBy: "id" },
  {
    table: "recurring_streams",
    select:
      "id, stream_id, account_id, direction, description, merchant_name, frequency, average_amount, last_amount, first_date, last_date, predicted_next_date, status, is_active, pfc_primary, pfc_detailed, user_marked_cancelled",
    orderBy: "id",
  },
  { table: "budgets", select: "*", orderBy: "id" },
  { table: "savings_goals", select: "*", orderBy: "id" },
  { table: "manual_assets", select: "*", orderBy: "id" },
  { table: "precious_metal_holdings", select: "*", orderBy: "id" },
  { table: "metal_prices", select: "*", orderBy: "metal" },
  { table: "net_worth_snapshots", select: "*", orderBy: "date" },
  { table: "alert_events", select: "*", orderBy: "created_at" },
  { table: "ui_preferences", select: "*", orderBy: "key" },
];

/** One JSON file with every table, for keeping a copy outside the app. */
export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();
  const results = await Promise.all(
    TABLES.map(async ({ table, select, orderBy }) => {
      const res = await fetchAllRows((from, to) => admin.from(table).select(select).order(orderBy).range(from, to));
      return { table, ...res };
    })
  );

  // A backup missing a table without saying so is worse than no backup.
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    for (const f of failed) console.error(`Export failed reading ${f.table}`, f.error);
    return NextResponse.json(
      { error: `Couldn't read ${failed.map((f) => f.table).join(", ")}. Nothing was downloaded; try again.` },
      { status: 500 }
    );
  }

  const exportedAt = new Date().toISOString();
  const tables = Object.fromEntries(results.map((r) => [r.table, r.data ?? []]));
  const body = JSON.stringify(
    {
      app: "Ledger.m",
      format: 1,
      exported_at: exportedAt,
      counts: Object.fromEntries(results.map((r) => [r.table, r.data?.length ?? 0])),
      tables,
    },
    null,
    2
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Named by the Eastern date, like everything else in the app.
      "Content-Disposition": `attachment; filename="ledger-m-backup-${calendarNow().isoDate}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
