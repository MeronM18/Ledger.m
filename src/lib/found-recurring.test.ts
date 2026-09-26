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
  prefs: resolveFoundRecurring(null),
  cancelledOn: () => null,
  todayIso: "2026-09-25",
  institutionOf: () => "Chase",
  ...over,
});

describe("foundRecurring", () => {
  it("lists one with its bank", () => {
    expect(foundRecurring([prime], opts())).toMatchObject([{ name: "Amazon Prime", active: true, institution: "Chase", cancelledOn: null }]);
  });

  it("leaves out one you dismissed, until you restore it", () => {
    const dismissed = applyFoundAction(resolveFoundRecurring(null), { key: prime.key, action: "dismiss" });
    expect(foundRecurring([prime], opts({ prefs: dismissed }))).toEqual([]);
    expect(foundRecurring([prime], opts({ prefs: applyFoundAction(dismissed, { key: prime.key, action: "restore" }) }))).toHaveLength(1);
  });

  it("takes one you cancelled out of the totals, from the day given or the older store", () => {
    expect(foundRecurring([prime], opts({ cancelledOn: () => "2026-09-20" }))[0]).toMatchObject({ active: false, cancelledOn: "2026-09-20" });
    const older = resolveFoundRecurring({ dismissed: [], cancelled: { [prime.key]: "2026-09-13" } });
    expect(foundRecurring([prime], opts({ prefs: older }))[0]).toMatchObject({ active: false, cancelledOn: "2026-09-13" });
  });

  it("drops one that stopped over a year ago", () => {
    expect(foundRecurring([{ ...prime, active: false, lastDate: "2025-06-13" }], opts())).toEqual([]);
  });
});
