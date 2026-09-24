import { describe, expect, it } from "vitest";
import { planEditCarryOver } from "@/lib/pending-edits";

describe("planEditCarryOver", () => {
  const ids = new Map([
    ["plaid-pending", "row-pending"],
    ["plaid-posted", "row-posted"],
    ["plaid-other-posted", "row-other"],
  ]);

  it("moves a pending charge's edit onto the posted one, every field of it", () => {
    const edit = { transaction_id: "row-pending", category: "TRAVEL", merchant_name: "Hotel", notes: "trip", reimbursed_amount: 40, created_at: "x", updated_at: "y" };
    expect(planEditCarryOver([{ posted: "plaid-posted", pending: "plaid-pending" }], ids, new Map([["row-pending", edit]]))).toEqual([
      { transaction_id: "row-posted", category: "TRAVEL", merchant_name: "Hotel", notes: "trip", reimbursed_amount: 40 },
    ]);
  });

  it("does nothing when the pending charge had no edit, or either side isn't stored", () => {
    expect(planEditCarryOver([{ posted: "plaid-other-posted", pending: "plaid-pending" }], ids, new Map())).toEqual([]);
    const edit = { transaction_id: "row-pending", notes: "x" };
    expect(planEditCarryOver([{ posted: "plaid-missing", pending: "plaid-pending" }], ids, new Map([["row-pending", edit]]))).toEqual([]);
  });
});
