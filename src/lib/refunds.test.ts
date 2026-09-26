import { describe, expect, it } from "vitest";
import type { Transaction as PlaidTransaction } from "plaid";
import { alertHref, refundAlerts } from "@/lib/alerts-logic";
import { depositsToReview } from "@/lib/deposit-review";
import { formatTransactionNotification, isStoreRefund } from "@/lib/plaid-notify-format";
import { matchRefunds, purchasesForRefund, resolveRefundChoices, withRefundDates } from "@/lib/refunds";
import { categoryTotalsForMonth, type SpendingTransaction } from "@/lib/spending-aggregation";

const CARD = { id: "card", name: "Freedom Flex", mask: "7788" };
const CHECKING = { id: "checking", name: "Total Checking", mask: "1234" };

type T = SpendingTransaction & { id: string; account: typeof CARD | null; isManual: boolean };
const tx = (id: string, o: Partial<T>): T => ({
  id,
  date: "2026-08-12",
  amount: 129.99,
  pfc_primary: "GENERAL_MERCHANDISE",
  merchant_name: "Nike",
  name: null,
  pending: false,
  account: CARD,
  isManual: false,
  ...o,
});

const dated = (list: T[], choices = {}) => withRefundDates(list, matchRefunds(list, choices), choices);

describe("matchRefunds", () => {
  it("dates a refund with its purchase in an earlier month, keeping the day it came back", () => {
    const list = [tx("buy", {}), tx("back", { date: "2026-09-03", amount: -129.99 })];
    const back = dated(list).find((t) => t.id === "back")!;
    expect(back.date).toBe("2026-08-12");
    expect(back.refunded_on).toBe("2026-09-03");
    expect(back.posted_date).toBe("2026-09-03");
    expect(back.refund_for).toMatchObject({ purchaseId: "buy", partial: false, chosen: false });
    expect(dated(list).find((t) => t.id === "buy")!.refunded).toBe(129.99);
    // August nets to nothing; September isn't made to look cheaper.
    expect(categoryTotalsForMonth(dated(list), 2026, 7)).toEqual([]);
    expect(categoryTotalsForMonth(dated(list), 2026, 8)).toEqual([]);
  });

  it("links a refund in the same month without moving it", () => {
    const list = [tx("buy", { date: "2026-09-01" }), tx("back", { date: "2026-09-20", amount: -129.99 })];
    const back = dated(list).find((t) => t.id === "back")!;
    expect(back.date).toBe("2026-09-20");
    expect(back.refunded_on).toBeUndefined();
    expect(back.refund_for?.purchaseId).toBe("buy");
  });

  it("keeps a statement's posted day for a moved refund", () => {
    const list = [tx("buy", {}), tx("back", { date: "2026-09-02", posted_date: "2026-09-04", amount: -129.99 })];
    expect(dated(list).find((t) => t.id === "back")!.posted_date).toBe("2026-09-04");
  });

  it("needs the same account, a purchase before it, and one within the window", () => {
    const back = tx("back", { date: "2026-09-03", amount: -129.99 });
    expect(matchRefunds([tx("buy", { account: CHECKING }), back]).size).toBe(0);
    expect(matchRefunds([tx("buy", { date: "2026-09-10" }), back]).size).toBe(0);
    expect(matchRefunds([tx("buy", { date: "2026-04-01" }), back]).size).toBe(0);
    expect(matchRefunds([tx("buy", { pending: true }), back]).size).toBe(0);
    expect(matchRefunds([tx("buy", {}), { ...back, pending: true }]).size).toBe(0);
  });

  it("takes the latest purchase of the same amount, and each once", () => {
    const list = [
      tx("july", { date: "2026-07-02", amount: 40 }),
      tx("aug", { date: "2026-08-20", amount: 40 }),
      tx("r1", { date: "2026-09-01", amount: -40 }),
      tx("r2", { date: "2026-09-05", amount: -40 }),
    ];
    const links = matchRefunds(list);
    expect(links.get("r1")?.purchaseId).toBe("aug");
    expect(links.get("r2")?.purchaseId).toBe("july");
  });

  it("matches a store named a little differently only for the same amount", () => {
    const list = [
      tx("buy", { merchant_name: "Amazon Mktplace", amount: 58.12 }),
      tx("back", { date: "2026-09-03", merchant_name: "Amazon.com", amount: -58.12 }),
      tx("part", { date: "2026-09-04", merchant_name: "Amazon.com", amount: -10 }),
    ];
    const links = matchRefunds(list);
    expect(links.get("back")?.purchaseId).toBe("buy");
    expect(links.has("part")).toBe(false);
  });

  it("matches part of a purchase only when every purchase it could be is in one month", () => {
    const oneMonth = [tx("a", { date: "2026-08-02", amount: 80 }), tx("b", { date: "2026-08-20", amount: 60 }), tx("back", { date: "2026-09-03", amount: -25 })];
    const part = dated(oneMonth).find((t) => t.id === "back")!;
    expect(part.refund_for).toMatchObject({ purchaseId: "b", partial: true });
    expect(part.date).toBe("2026-08-20");

    const twoMonths = [tx("a", { date: "2026-07-02", amount: 80 }), tx("b", { date: "2026-08-20", amount: 60 }), tx("back", { date: "2026-09-03", amount: -25 })];
    expect(matchRefunds(twoMonths).has("back")).toBe(false);
  });

  it("never gives back more than a purchase cost", () => {
    const list = [tx("buy", { amount: 50 }), tx("r1", { date: "2026-09-01", amount: -30 }), tx("r2", { date: "2026-09-02", amount: -30 })];
    const links = matchRefunds(list);
    expect(links.get("r1")?.purchaseId).toBe("buy");
    expect(links.has("r2")).toBe(false);
  });

  it("goes by your choice: a purchase you picked, or none", () => {
    const list = [tx("buy", {}), tx("other", { date: "2026-07-30", merchant_name: "Foot Locker", amount: 200 }), tx("back", { date: "2026-09-03", amount: -129.99 })];
    expect(matchRefunds(list, { back: "other" }).get("back")).toMatchObject({ purchaseId: "other", chosen: true });
    const kept = dated(list, { back: "none" }).find((t) => t.id === "back")!;
    expect(kept.refund_for).toBeUndefined();
    expect(kept.refund_kept).toBe(true);
    expect(kept.date).toBe("2026-09-03");
    // A purchase that's gone: found again.
    expect(matchRefunds(list, { back: "deleted" }).get("back")?.purchaseId).toBe("buy");
  });

  it("reads stored choices defensively", () => {
    expect(resolveRefundChoices(null)).toEqual({});
    expect(resolveRefundChoices({ a: "buy", b: 3, c: "" })).toEqual({ a: "buy" });
  });

  it("lists purchases a refund could be for, the same store's first", () => {
    const list = [tx("nike", { date: "2026-08-01" }), tx("kroger", { date: "2026-08-30", merchant_name: "Kroger", amount: 80 }), tx("elsewhere", { account: CHECKING }), tx("back", { date: "2026-09-03", amount: -20, merchant_name: "Nike" })];
    const back = dated(list).find((t) => t.id === "back")!;
    expect(purchasesForRefund(back, list).map((p) => p.id)).toEqual(["nike", "kroger"]);
  });
});

describe("refundAlerts", () => {
  const today = "2026-09-04";

  it("says what a refund is for and the month it counts in", () => {
    const list = dated([tx("buy", {}), tx("back", { date: "2026-09-03", amount: -129.99 })]);
    expect(refundAlerts(list, new Set(["card"]), today, "USD")).toEqual([
      {
        key: "refund:back",
        kind: "refund",
        title: "$129.99 back from Nike",
        body: "A refund to Freedom Flex ••7788 for your Aug 12 purchase. It counts in August, with the purchase.",
        href: "/transactions?open=back",
      },
    ]);
  });

  it("names part of a purchase, and one with no purchase found", () => {
    const part = dated([tx("a", { amount: 80 }), tx("back", { date: "2026-09-03", amount: -25 })]);
    expect(refundAlerts(part, new Set(["card"]), today, "USD")[0].body).toBe(
      "A refund to Freedom Flex ••7788 for part of your $80.00 purchase on Aug 12. It counts in August, with the purchase."
    );
    const alone = dated([tx("back", { date: "2026-09-03", amount: -25 })]);
    expect(refundAlerts(alone, new Set(["card"]), today, "USD")[0].body).toBe("A refund to Freedom Flex ••7788. It comes off General Merchandise spending for September.");
  });

  it("goes by the day it came back, and waits for a pending one to post", () => {
    const list = dated([tx("buy", {}), tx("back", { date: "2026-08-25", amount: -129.99 })]);
    expect(refundAlerts(list, new Set(["card"]), today, "USD")).toEqual([]);
    expect(refundAlerts([tx("back", { date: "2026-09-03", amount: -20, pending: true })], new Set(["card"]), today, "USD")).toEqual([]);
  });

  it("leaves an uncategorized deposit to deposit review, unless it matched a purchase", () => {
    const deposit = tx("dep", { date: "2026-09-03", amount: -20, pfc_primary: null, account: CHECKING });
    expect(refundAlerts([deposit], new Set(["card"]), today, "USD")).toEqual([]);
    const matched = dated([tx("buy", { amount: 20, pfc_primary: null, account: CHECKING }), deposit]);
    expect(refundAlerts(matched, new Set(["card"]), today, "USD")).toHaveLength(1);
    expect(depositsToReview(matched, new Set(["card"]), {}, today)).toEqual([]);
    expect(depositsToReview([deposit], new Set(["card"]), {}, today)).toHaveLength(1);
  });

  it("links an alert in the list to its transaction", () => {
    expect(alertHref("refund", "refund:abc")).toBe("/transactions?open=abc");
    expect(alertHref("renewal", "renewal:plaid:x")).toBeUndefined();
  });
});

describe("refund pushes", () => {
  const plaid = (o: Partial<PlaidTransaction>) =>
    ({
      transaction_id: "p1",
      amount: -129.99,
      iso_currency_code: "USD",
      name: "NIKE.COM",
      merchant_name: "Nike",
      pending: false,
      personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES" },
      ...o,
    }) as PlaidTransaction;

  it("knows a store refund from other money in", () => {
    expect(isStoreRefund(plaid({}))).toBe(true);
    expect(isStoreRefund(plaid({ amount: 20 }))).toBe(false);
    expect(isStoreRefund(plaid({ personal_finance_category: { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_DEPOSIT" } }))).toBe(false);
    expect(isStoreRefund(plaid({ personal_finance_category: null }))).toBe(false);
  });

  it("labels a refund push as one", () => {
    expect(formatTransactionNotification(plaid({}), "Freedom Flex ••7788")).toEqual({ subtitle: "Refund: +$129.99 from Nike", body: "Refund on Freedom Flex ••7788" });
  });
});
