import { describe, expect, it } from "vitest";
import {
  applyReviewAction,
  chargeMatches,
  monthAfter,
  reconcileSubscriptions,
  resolveSubscriptionReview,
  type EntryInput,
  type ReviewCharge,
} from "@/lib/subscription-review";

const TODAY = "2026-09-25";
const none = resolveSubscriptionReview(null);
const entry = (e: Partial<EntryInput> & Pick<EntryInput, "key" | "source" | "name">): EntryInput => ({
  amount: 7.94,
  active: true,
  cancelled: false,
  cancelledOn: null,
  ...e,
});
let seq = 0;
const charge = (date: string, name: string, amount: number, extra: Partial<ReviewCharge> = {}): ReviewCharge => ({
  id: `c${++seq}`,
  date,
  name,
  amount,
  pending: false,
  accountId: "sapphire",
  accountName: "Sapphire Preferred",
  category: "GENERAL_SERVICES",
  ...extra,
});

describe("monthAfter", () => {
  it("keeps the day, or the month's last", () => {
    expect(monthAfter("2026-09-13")).toBe("2026-10-13");
    expect(monthAfter("2026-01-31")).toBe("2026-02-28");
    expect(monthAfter("2026-12-05")).toBe("2027-01-05");
  });
});

describe("chargeMatches", () => {
  it("matches by name and about the price, not every purchase from the merchant", () => {
    expect(chargeMatches({ name: "Amazon Prime", amount: 7.94 }, { name: "Amazon Prime", amount: 7.94 })).toBe(true);
    expect(chargeMatches({ name: "Amazon Prime", amount: 8.99 }, { name: "Amazon Prime", amount: 7.94 })).toBe(true);
    expect(chargeMatches({ name: "Amazon", amount: 64.2 }, { name: "Amazon Prime", amount: 7.94 })).toBe(false);
    expect(chargeMatches({ name: "Netflix", amount: 7.94 }, { name: "Amazon Prime", amount: 7.94 })).toBe(false);
  });
});

describe("reconcileSubscriptions: one entry per service", () => {
  it("lets the bank's copy, then the found one, stand for one you added", () => {
    const r = reconcileSubscriptions(
      [
        entry({ key: "plaid-1", source: "plaid", name: "Netflix" }),
        entry({ key: "found-netflix", source: "found", name: "NETFLIX.COM" }),
        entry({ key: "manual-1", source: "manual", name: "Netflix" }),
        entry({ key: "manual-2", source: "manual", name: "Spotify" }),
      ],
      [],
      none,
      TODAY
    );
    expect(Object.fromEntries(r.covered)).toEqual({ "found-netflix": "plaid-1", "manual-1": "plaid-1" });
    expect(Object.fromEntries(r.covers)).toEqual({ "plaid-1": ["manual-1"] });
  });

  it("hides the bank's stopped copy of one that goes on elsewhere, but not one you cancelled", () => {
    const r = reconcileSubscriptions(
      [
        entry({ key: "plaid-old", source: "plaid", name: "Amazon Prime", active: false }),
        entry({ key: "plaid-cancelled", source: "plaid", name: "Hulu", active: false, cancelled: true }),
        entry({ key: "found-prime", source: "found", name: "Amazon Prime" }),
      ],
      [],
      none,
      TODAY
    );
    expect(r.covered.get("plaid-old")).toBe("found-prime");
    expect(r.covered.has("plaid-cancelled")).toBe(false);
    expect(r.covered.has("found-prime")).toBe(false);
  });

  it("keeps one you added covered while the one standing for it is cancelled, so it doesn't come back on its own", () => {
    const r = reconcileSubscriptions(
      [entry({ key: "found-prime", source: "found", name: "Amazon Prime", active: false, cancelled: true, cancelledOn: "2026-09-20" }), entry({ key: "manual-1", source: "manual", name: "Amazon Prime" })],
      [],
      none,
      TODAY
    );
    expect(r.covered.get("manual-1")).toBe("found-prime");
  });
});

describe("reconcileSubscriptions: charges after a cancel", () => {
  const cancelled = entry({ key: "manual-1", source: "manual", name: "Amazon Prime", active: false, cancelled: true, cancelledOn: "2026-09-01" });

  it("flags a single charge after the day you cancelled, pending or not", () => {
    const late = charge("2026-09-13", "Amazon Prime", 7.94, { pending: true });
    const r = reconcileSubscriptions([cancelled], [charge("2026-08-13", "Amazon Prime", 7.94), late, charge("2026-09-14", "Amazon", 52)], none, TODAY);
    expect(r.afterCancel).toEqual([{ key: "manual-1", name: "Amazon Prime", cancelledOn: "2026-09-01", charge: late }]);
    // Not also asked about as a new subscription.
    expect(r.newSubscriptions).toEqual([]);
  });

  it("flags it even when a found copy now stands for the one you cancelled", () => {
    const r = reconcileSubscriptions([cancelled, entry({ key: "found-prime", source: "found", name: "Amazon Prime" })], [charge("2026-09-13", "Amazon Prime", 7.94)], none, TODAY);
    expect(r.afterCancel.map((a) => a.key)).toEqual(["manual-1"]);
  });

  it("stops flagging a charge you expected, including once it posts a day or two later", () => {
    const prefs = applyReviewAction(none, { action: "acknowledge", key: "manual-1", date: "2026-09-13", amount: 7.94 });
    expect(reconcileSubscriptions([cancelled], [charge("2026-09-15", "Amazon Prime", 7.94)], prefs, TODAY).afterCancel).toEqual([]);
  });

  it("says nothing for one cancelled without a day", () => {
    const r = reconcileSubscriptions([{ ...cancelled, cancelledOn: null }], [charge("2026-09-13", "Amazon Prime", 7.94)], none, TODAY);
    expect(r.afterCancel).toEqual([]);
  });
});

describe("reconcileSubscriptions: first charges", () => {
  it("asks about a first charge from a subscription service the day it shows up, pending too", () => {
    const first = charge("2026-09-24", "Netflix", 15.49, { pending: true });
    const r = reconcileSubscriptions([], [first], none, TODAY);
    expect(r.newSubscriptions).toEqual([{ charge: first, name: "Netflix", renewsOn: "2026-10-24" }]);
  });

  it("doesn't ask about a merchant that isn't a subscription service, one already tracked, or one charging for a while", () => {
    expect(reconcileSubscriptions([], [charge("2026-09-24", "Corner Deli", 12)], none, TODAY).newSubscriptions).toEqual([]);
    expect(reconcileSubscriptions([entry({ key: "manual-1", source: "manual", name: "Netflix", amount: 15.49 })], [charge("2026-09-24", "Netflix", 15.49)], none, TODAY).newSubscriptions).toEqual([]);
    expect(reconcileSubscriptions([], [charge("2026-08-24", "Netflix", 15.49), charge("2026-09-24", "Netflix", 15.49)], none, TODAY).newSubscriptions).toEqual([]);
  });

  it("asks again about one that stopped on its own and restarted", () => {
    const back = charge("2026-09-20", "Hulu", 9.99);
    const r = reconcileSubscriptions([entry({ key: "plaid-1", source: "plaid", name: "Hulu", active: false, amount: 9.99 })], [charge("2026-03-20", "Hulu", 9.99), back], none, TODAY);
    expect(r.newSubscriptions.map((n) => n.charge)).toEqual([back]);
  });

  it("stops asking once you say it isn't one, also after it posts", () => {
    const prefs = applyReviewAction(none, { action: "dismiss-new", name: "Netflix", date: "2026-09-24", amount: 15.49 });
    expect(reconcileSubscriptions([], [charge("2026-09-25", "Netflix", 15.49)], prefs, TODAY).newSubscriptions).toEqual([]);
  });

  it("forgets a first charge after a month", () => {
    expect(reconcileSubscriptions([], [charge("2026-08-01", "Netflix", 15.49)], none, TODAY).newSubscriptions).toEqual([]);
  });
});

describe("reconcileSubscriptions: found ones to confirm", () => {
  it("asks about a found one that just started, until you confirm it", () => {
    const found = entry({ key: "found-x", source: "found", name: "Duke Energy", firstDate: "2026-08-06" });
    expect(reconcileSubscriptions([found], [], none, TODAY).toConfirm).toEqual(["found-x"]);
    expect(reconcileSubscriptions([{ ...found, confirmed: true }], [], none, TODAY).toConfirm).toEqual([]);
    expect(reconcileSubscriptions([{ ...found, firstDate: "2026-03-06" }], [], none, TODAY).toConfirm).toEqual([]);
  });
});

describe("applyReviewAction", () => {
  it("records a cancel day and forgets it (and its expected charges) on undo", () => {
    let p = applyReviewAction(none, { action: "cancel", key: "plaid-1", on: "2026-09-20" });
    p = applyReviewAction(p, { action: "acknowledge", key: "plaid-1", date: "2026-10-01", amount: 9.99 });
    expect(p.cancellations).toEqual({ "plaid-1": "2026-09-20" });
    p = applyReviewAction(p, { action: "uncancel", key: "plaid-1" });
    expect(p).toMatchObject({ cancellations: {}, acknowledged: [] });
  });
});
