import { describe, expect, it } from "vitest";
import {
  applyEditsToAll,
  applyTransactionEdits,
  findMatchingRule,
  type MerchantRule,
  type TransactionOverride,
} from "@/lib/transaction-edits";
import { filterSpendingTransactions } from "@/lib/spending-aggregation";
import { effectiveCategory, humanizeTransactionName } from "@/lib/transaction-display";

const rule = (o: Partial<MerchantRule> & { match_text: string }): MerchantRule => ({
  id: o.match_text,
  rename_to: null,
  category: null,
  ...o,
});

const tx = (o: Partial<{ id: string; name: string | null; merchant_name: string | null; pfc_primary: string | null }> = {}) => ({
  id: "t1",
  name: "AMZN MKTP US*2K4 SEATTLE WA",
  merchant_name: "Amazon",
  pfc_primary: "GENERAL_MERCHANDISE",
  ...o,
});

describe("findMatchingRule", () => {
  it("matches case-insensitively against merchant and raw name", () => {
    expect(findMatchingRule(tx(), [rule({ match_text: "amzn mktp" })])?.match_text).toBe("amzn mktp");
    expect(findMatchingRule(tx(), [rule({ match_text: "AMAZON" })])).not.toBeNull();
  });

  it("prefers the longest (most specific) match", () => {
    const rules = [rule({ match_text: "amazon" }), rule({ match_text: "amazon prime" })];
    expect(findMatchingRule(tx({ merchant_name: "Amazon Prime Video" }), rules)?.match_text).toBe("amazon prime");
  });

  it("ignores too-short match text so a stray letter cannot match everything", () => {
    expect(findMatchingRule(tx(), [rule({ match_text: "a" }), rule({ match_text: "  " })])).toBeNull();
  });
});

describe("applyTransactionEdits", () => {
  const override = (o: Partial<TransactionOverride>): TransactionOverride => ({
    transaction_id: "t1",
    category: null,
    merchant_name: null,
    notes: null,
    ...o,
  });

  it("changes nothing when there is no override or rule", () => {
    const out = applyTransactionEdits(tx(), undefined, []);
    expect(out.merchant_name).toBe("Amazon");
    expect(out.category_override).toBeNull();
    expect(out.edited).toBe(false);
  });

  it("a per-transaction override beats a rule, field by field", () => {
    const out = applyTransactionEdits(
      tx(),
      override({ category: "ENTERTAINMENT" }),
      [rule({ match_text: "amazon", rename_to: "Amazon Shopping", category: "PERSONAL_CARE" })]
    );
    expect(out.category_override).toBe("ENTERTAINMENT"); // override wins
    expect(out.merchant_name).toBe("Amazon Shopping"); // rule fills the field the override left blank
    expect(out.original_merchant_name).toBe("Amazon");
    expect(out.edited).toBe(true);
  });

  it("keeps notes and treats blank strings as no edit", () => {
    const out = applyTransactionEdits(tx(), override({ merchant_name: "  ", notes: " birthday gift " }), []);
    expect(out.merchant_name).toBe("Amazon");
    expect(out.notes).toBe("birthday gift");
  });

  it("does not mutate the input row", () => {
    const row = tx();
    applyTransactionEdits(row, override({ merchant_name: "Renamed" }), []);
    expect(row.merchant_name).toBe("Amazon");
  });
});

describe("edits flow through the display and aggregation layers", () => {
  it("a chosen category beats the PayPal/payroll heuristics", () => {
    const paypal = { name: "PAYPAL INST XFER", merchant_name: null, pfc_primary: "LOAN_DISBURSEMENTS", amount: 40 };
    expect(effectiveCategory(paypal)).toBe("TRANSFER");
    expect(effectiveCategory({ ...paypal, category_override: "ENTERTAINMENT" })).toBe("ENTERTAINMENT");
  });

  it("a rename shows as the display name", () => {
    const [row] = applyEditsToAll([tx()], new Map(), [rule({ match_text: "amazon", rename_to: "Amazon Shopping" })]);
    expect(humanizeTransactionName({ ...row, amount: 5 })).toBe("Amazon Shopping");
  });

  it("recategorizing into a non-spending category removes it from spending", () => {
    const base = { date: "2026-09-10", amount: 100, pending: false, pfc_primary: "GENERAL_MERCHANDISE", merchant_name: "Store", name: "STORE" };
    expect(filterSpendingTransactions([base])).toHaveLength(1);
    expect(filterSpendingTransactions([{ ...base, category_override: "TRANSFER_OUT" }])).toHaveLength(0);
  });

  it("a hand-picked category on a card payment is not pulled back in as spending", () => {
    const payment = {
      date: "2026-09-10",
      amount: 200,
      pending: false,
      pfc_primary: "LOAN_PAYMENTS",
      pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      merchant_name: "Apple Card",
      name: "APPLE CARD PAYMENT",
    };
    expect(filterSpendingTransactions([payment], ["Chase"])).toHaveLength(1);
    expect(filterSpendingTransactions([{ ...payment, category_override: "TRANSFER_OUT" }], ["Chase"])).toHaveLength(0);
  });
});
