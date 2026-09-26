import { describe, expect, it } from "vitest";
import { applyFoundAction, foundRecurring, resolveFoundRecurring } from "@/lib/found-recurring";
import type { DetectedSubscription } from "@/lib/recurring-detection";

const prime: DetectedSubscription = {
  key: "amazonprime|MONTHLY|8",
  name: "Amazon Prime",
  amount: 7.94,
  amountVaries: false,
  frequency: "MONTHLY",
  occurrences: 3,
  firstDate: "2026-07-13",
  lastDate: "2026-09-13",
  nextDate: "2026-10-13",
  accountId: "sapphire",
  accountName: "Sapphire Preferred",
  active: true,
  restarted: true,
  previousAmount: null,
  charges: [],
};
const opts = (over: Partial<Parameters<typeof foundRecurring>[1]> = {}) => ({
  tracked: [],
  cancelledElsewhere: [],
  prefs: resolveFoundRecurring(null),
  todayIso: "2026-09-25",
  institutionOf: () => "Chase",
  ...over,
});

describe("foundRecurring", () => {
  it("lists one nothing else tracks, with its bank", () => {
    expect(foundRecurring([prime], opts())).toMatchObject([{ name: "Amazon Prime", active: true, institution: "Chase", chargedAfterCancel: false }]);
  });

  it("leaves out one the bank or you already track, and one you dismissed", () => {
    expect(foundRecurring([prime], opts({ tracked: ["AMAZON PRIME"] }))).toEqual([]);
    expect(foundRecurring([prime], opts({ prefs: applyFoundAction(resolveFoundRecurring(null), { key: prime.key, action: "dismiss" }) }))).toEqual([]);
  });

  it("keeps one you cancelled out of the totals until it charges again", () => {
    const cancelledThen = applyFoundAction(resolveFoundRecurring(null), { key: prime.key, action: "cancel", lastDate: "2026-09-13" });
    expect(foundRecurring([prime], opts({ prefs: cancelledThen }))[0]).toMatchObject({ active: false, cancelledByYou: true, chargedAfterCancel: false });
    const cancelledBefore = applyFoundAction(resolveFoundRecurring(null), { key: prime.key, action: "cancel", lastDate: "2026-08-13" });
    expect(foundRecurring([prime], opts({ prefs: cancelledBefore }))[0]).toMatchObject({ active: true, cancelledByYou: false, chargedAfterCancel: true });
  });

  it("flags one you'd cancelled elsewhere that's charging again", () => {
    const [row] = foundRecurring([prime], opts({ cancelledElsewhere: [{ name: "Amazon Prime", lastDate: "2025-12-15" }] }));
    expect(row.chargedAfterCancel).toBe(true);
  });

  it("drops one that stopped over a year ago", () => {
    expect(foundRecurring([{ ...prime, active: false, lastDate: "2025-06-13" }], opts())).toEqual([]);
  });
});

describe("applyFoundAction", () => {
  it("restoring clears a dismissal or a cancel", () => {
    let prefs = applyFoundAction(resolveFoundRecurring(null), { key: "a", action: "dismiss" });
    prefs = applyFoundAction(prefs, { key: "b", action: "cancel", lastDate: "2026-09-01" });
    prefs = applyFoundAction(applyFoundAction(prefs, { key: "a", action: "restore" }), { key: "b", action: "restore" });
    expect(prefs).toEqual({ dismissed: [], cancelled: {} });
  });
});
