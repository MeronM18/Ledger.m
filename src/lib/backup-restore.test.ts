import { describe, expect, it } from "vitest";
import { planRestore, restorePayload } from "@/lib/backup-restore";

const backup = {
  app: "Ledger.m",
  format: 1,
  exported_at: "2026-09-20T12:00:00Z",
  tables: {
    transactions: [
      { id: "old-tx-1", plaid_transaction_id: "p-tx-1", amount: 10 },
      { id: "old-tx-2", plaid_transaction_id: "p-tx-2", amount: 20 },
    ],
    accounts: [{ id: "old-acct", plaid_account_id: "p-acct", access_token: "never" }],
    transaction_overrides: [
      { transaction_id: "old-tx-1", notes: "dinner" },
      { transaction_id: "old-tx-2", notes: "gone now" },
    ],
    budgets: [{ id: "b1", category: "FOOD_AND_DRINK", monthly_amount: 600 }],
    savings_goals: [
      { id: "g1", name: "Trip", account_id: "old-acct" },
      { id: "g2", name: "By hand", account_id: null },
    ],
    manual_transactions: [{ id: "m1", manual_account_id: "ma1" }],
    manual_accounts: [{ id: "ma1", name: "Apple Card" }],
    alert_events: [{ id: "a1", dedupe_key: "k", title: "t" }],
  },
};

describe("restorePayload", () => {
  it("takes only what the restore needs, and nothing like a token", () => {
    const r = restorePayload(backup);
    if ("error" in r) throw new Error(r.error);
    expect(r.payload.accounts).toEqual([{ id: "old-acct", plaid_account_id: "p-acct" }]);
    expect(JSON.stringify(r.payload)).not.toContain("never");
    expect(r.payload.transactions).toEqual([
      { id: "old-tx-1", plaid_transaction_id: "p-tx-1" },
      { id: "old-tx-2", plaid_transaction_id: "p-tx-2" },
    ]);
  });

  it("turns away files that aren't a Ledger.m backup, or are from a newer version", () => {
    expect(restorePayload({ hello: 1 })).toEqual({ error: "That file isn't a Ledger.m backup." });
    expect(restorePayload({ ...backup, format: 2 })).toHaveProperty("error");
  });
});

describe("planRestore", () => {
  const { payload } = restorePayload(backup) as Extract<ReturnType<typeof restorePayload>, { payload: unknown }>;
  // The bank was reconnected: same Plaid ids, new internal ids. p-tx-2 is gone.
  const plan = planRestore(payload, {
    transactionIdByPlaid: new Map([["p-tx-1", "new-tx-1"]]),
    accountIdByPlaid: new Map([["p-acct", "new-acct"]]),
  });
  const step = (t: string) => plan.steps.find((s) => s.table === t)!;

  it("restores a manual account before its transactions", () => {
    const order = plan.steps.map((s) => s.table);
    expect(order.indexOf("manual_accounts")).toBeLessThan(order.indexOf("manual_transactions"));
  });

  it("finds edits their transaction by Plaid's id, and counts the ones it can't place", () => {
    expect(step("transaction_overrides").rows).toEqual([{ transaction_id: "new-tx-1", notes: "dinner" }]);
    expect(plan.unmatchedEdits).toBe(1);
  });

  it("points a goal at its account as connected now, or leaves it tracked by hand", () => {
    expect(step("savings_goals").rows).toEqual([
      { id: "g1", name: "Trip", account_id: "new-acct" },
      { id: "g2", name: "By hand", account_id: null },
    ]);
    const orphan = planRestore(payload, { transactionIdByPlaid: new Map(), accountIdByPlaid: new Map() });
    expect(orphan.steps.find((s) => s.table === "savings_goals")!.rows[0].account_id).toBeNull();
  });

  it("matches budgets by category and keeps alert history that's already there", () => {
    expect(step("budgets")).toMatchObject({ onConflict: "category", rows: [{ category: "FOOD_AND_DRINK", monthly_amount: 600 }] });
    expect(step("budgets").rows[0]).not.toHaveProperty("id");
    expect(step("alert_events")).toMatchObject({ onConflict: "dedupe_key", keepExisting: true });
  });

  it("counts what it will write, and skips empty tables", () => {
    expect(plan.counts).toMatchObject({ transaction_overrides: 1, budgets: 1, savings_goals: 2, manual_transactions: 1 });
    expect(plan.steps.find((s) => s.table === "merchant_rules")).toBeUndefined();
  });
});
