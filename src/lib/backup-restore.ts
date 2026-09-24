// Pure. Restoring a backup file (the JSON from Settings → Download backup).
//
// What comes back is everything you made: budgets, goals, assets, metals,
// manual transactions and accounts (Apple Card, Apple Savings), manual
// subscriptions, merchant rules, your edits to bank transactions, net worth
// history, alert history and settings. Bank data (connections, accounts,
// transactions, detected subscriptions) isn't restored: it belongs to Plaid,
// the file has no bank access tokens by design, and reconnecting a bank
// brings its history back.
//
// It merges, never wipes: every row in the file is written back (a missing
// one returns, a changed one goes back to how it was), and anything made
// since the backup is left alone.

type Row = Record<string, unknown>;

export type RestoreStep = {
  table: string;
  rows: Row[];
  // The column a row is matched on: its id, or a natural key the table is
  // unique on (a budget's category, a snapshot's date).
  onConflict: string;
  // Matched on a natural key: the file's id is dropped so an existing row
  // keeps its own.
  dropId?: boolean;
  // Keep what's there instead of overwriting it (history that never changes).
  keepExisting?: boolean;
};

export type RestorePlan = {
  exportedAt: string | null;
  steps: RestoreStep[];
  // Rows per table that will be written.
  counts: Record<string, number>;
  // Edits to bank transactions that aren't in the app now (a transaction
  // since removed by the bank, or a bank not reconnected yet).
  unmatchedEdits: number;
};

// In order: a manual account before its transactions.
const STEPS: Omit<RestoreStep, "rows">[] = [
  { table: "manual_accounts", onConflict: "id" },
  { table: "manual_transactions", onConflict: "id" },
  { table: "manual_subscriptions", onConflict: "id" },
  { table: "merchant_rules", onConflict: "id" },
  { table: "transaction_overrides", onConflict: "transaction_id" },
  { table: "budgets", onConflict: "category", dropId: true },
  { table: "savings_goals", onConflict: "id" },
  { table: "manual_assets", onConflict: "id" },
  { table: "precious_metal_holdings", onConflict: "id" },
  { table: "net_worth_snapshots", onConflict: "date", dropId: true },
  { table: "alert_events", onConflict: "dedupe_key", dropId: true, keepExisting: true },
  { table: "ui_preferences", onConflict: "key" },
];

export const RESTORED_TABLES = STEPS.map((s) => s.table);

/**
 * The part of a backup file the restore needs: the tables it writes, plus
 * the bank transaction and account ids (internal and Plaid's), to find
 * where edits and goals belong now. Taken in the browser, so only that
 * goes up, not the whole file.
 */
export function restorePayload(backup: unknown): { payload: RestorePayload } | { error: string } {
  if (!backup || typeof backup !== "object") return { error: "That file isn't a Ledger.m backup." };
  const b = backup as { app?: unknown; format?: unknown; exported_at?: unknown; tables?: Record<string, unknown> };
  if (b.app !== "Ledger.m" || typeof b.tables !== "object" || b.tables === null) {
    return { error: "That file isn't a Ledger.m backup." };
  }
  if (b.format !== 1) return { error: "That backup is from a newer version of Ledger.m than this one." };
  const rows = (name: string) => (Array.isArray(b.tables![name]) ? (b.tables![name] as Row[]) : []);
  return {
    payload: {
      exportedAt: typeof b.exported_at === "string" ? b.exported_at : null,
      tables: Object.fromEntries(RESTORED_TABLES.map((t) => [t, rows(t)])),
      transactions: rows("transactions").map((t) => ({ id: String(t.id), plaid_transaction_id: String(t.plaid_transaction_id) })),
      accounts: rows("accounts").map((a) => ({ id: String(a.id), plaid_account_id: String(a.plaid_account_id) })),
    },
  };
}

export type RestorePayload = {
  exportedAt: string | null;
  tables: Record<string, Row[]>;
  transactions: { id: string; plaid_transaction_id: string }[];
  accounts: { id: string; plaid_account_id: string }[];
};

/**
 * What to write where. `current` maps Plaid's ids to the app's ids now, so
 * an edit or a goal lands on the right bank transaction or account even if
 * the bank was reconnected since (new internal ids, same Plaid ids).
 */
export function planRestore(
  payload: RestorePayload,
  current: { transactionIdByPlaid: Map<string, string>; accountIdByPlaid: Map<string, string> }
): RestorePlan {
  const plaidTxOf = new Map(payload.transactions.map((t) => [t.id, t.plaid_transaction_id]));
  const plaidAccountOf = new Map(payload.accounts.map((a) => [a.id, a.plaid_account_id]));
  let unmatchedEdits = 0;

  const steps = STEPS.map((step) => {
    let rows = payload.tables[step.table] ?? [];

    if (step.table === "transaction_overrides") {
      rows = rows.flatMap((r) => {
        const plaidId = plaidTxOf.get(String(r.transaction_id));
        const now = plaidId ? current.transactionIdByPlaid.get(plaidId) : undefined;
        if (!now) {
          unmatchedEdits++;
          return [];
        }
        return [{ ...r, transaction_id: now }];
      });
    }

    if (step.table === "savings_goals") {
      // A goal that followed an account follows it again, or is kept as a
      // hand-tracked goal if that account isn't connected now.
      rows = rows.map((r) => {
        if (!r.account_id) return r;
        const plaidId = plaidAccountOf.get(String(r.account_id));
        return { ...r, account_id: (plaidId && current.accountIdByPlaid.get(plaidId)) ?? null };
      });
    }

    if (step.dropId) {
      rows = rows.map((r) => {
        const copy = { ...r };
        delete copy.id;
        return copy;
      });
    }
    return { ...step, rows };
  }).filter((s) => s.rows.length > 0);

  return {
    exportedAt: payload.exportedAt,
    steps,
    counts: Object.fromEntries(steps.map((s) => [s.table, s.rows.length])),
    unmatchedEdits,
  };
}

// How each table reads in the preview.
export const RESTORE_LABELS: Record<string, string> = {
  manual_accounts: "Manual accounts (Apple Card, Apple Savings)",
  manual_transactions: "Manual and imported transactions",
  manual_subscriptions: "Manual subscriptions",
  merchant_rules: "Merchant rules",
  transaction_overrides: "Edits to bank transactions",
  budgets: "Budgets",
  savings_goals: "Goals",
  manual_assets: "Assets (cash and others)",
  precious_metal_holdings: "Precious metals",
  net_worth_snapshots: "Net worth history (days)",
  alert_events: "Alert history",
  ui_preferences: "Settings and layout",
};
