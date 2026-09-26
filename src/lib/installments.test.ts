import { describe, expect, it } from "vitest";
import { installmentDueAlerts } from "@/lib/alerts-logic";
import {
  addMonths,
  buildInstallmentPlans,
  detectInstallments,
  installmentPaymentLabel,
  installmentPaymentsBetween,
  paymentNumber,
  resolveInstallmentPrefs,
  type InstallmentCharge,
} from "@/lib/installments";

const APPLE = "manual:apple";
let seq = 0;
const charge = (date: string, amount: number, extra: Partial<InstallmentCharge> = {}): InstallmentCharge => ({
  id: `c${++seq}`,
  date,
  amount,
  name: "Apple Online Store",
  note: "Apple Card Monthly Installment",
  accountId: APPLE,
  accountName: "Apple Card",
  ...extra,
});
const none = resolveInstallmentPrefs(null);

describe("addMonths", () => {
  it("keeps the day, or the month's last day when it's shorter", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("paymentNumber", () => {
  it("reads which payment of how many", () => {
    expect(paymentNumber("MONTHLY INSTALLMENTS (3 OF 12)")).toEqual({ n: 3, of: 12 });
    expect(paymentNumber("installment 2/24")).toEqual({ n: 2, of: 24 });
    expect(paymentNumber("24/7 Fitness")).toBeNull();
    expect(paymentNumber("Apple Online Store")).toBeNull();
  });
});

describe("detectInstallments", () => {
  it("groups a card's noted installments by amount, with a last payment a cent off", () => {
    const plans = detectInstallments([
      charge("2026-05-31", 133.25),
      charge("2026-06-30", 133.25),
      charge("2026-07-31", 133.26),
      charge("2026-06-30", 41.58),
      charge("2026-06-12", 58.1, { note: null, name: "Whole Foods" }),
    ]);
    expect(plans).toHaveLength(2);
    const mac = plans.find((p) => p.monthly === 133.25)!;
    expect(mac.charges).toHaveLength(3);
    expect(mac.start).toBe("2026-05-31");
    expect(mac.key).toBe(`${APPLE}|13325`);
  });

  it("takes the length and first payment from '3 of 12'", () => {
    const [plan] = detectInstallments([charge("2026-07-31", 100, { note: "Apple Card Monthly Installment 3 of 12" })]);
    expect(plan.of).toBe(12);
    expect(plan.start).toBe("2026-05-31");
  });

  it("finds an Apple Store charge repeating to the cent in consecutive months, even without a note", () => {
    const plans = detectInstallments([
      charge("2026-06-30", 83.29, { note: null }),
      charge("2026-07-31", 83.29, { note: null }),
      // A one-off Apple Store purchase, and a repeat that isn't month after month.
      charge("2026-07-10", 29, { note: null }),
      charge("2026-03-02", 49, { note: null }),
      charge("2026-06-02", 49, { note: null }),
    ]);
    expect(plans.map((p) => p.monthly)).toEqual([83.29]);
  });

  it("ignores refunds and payments", () => {
    expect(detectInstallments([charge("2026-06-30", -133.25)])).toEqual([]);
  });
});

describe("buildInstallmentPlans", () => {
  const mac = [charge("2026-05-31", 133.25), charge("2026-06-30", 133.25), charge("2026-07-31", 133.25)];

  it("lays out twelve payments and counts those due by today as paid, imported or not", () => {
    const [plan] = buildInstallmentPlans(mac, none, "2026-09-25");
    expect(plan.payments).toBe(12);
    // May through August: four, and August's isn't in the imports yet.
    expect(plan.paid).toBe(4);
    expect(plan.schedule[3]).toMatchObject({ date: "2026-08-31", status: "paid", charge: null });
    expect(plan.next).toMatchObject({ n: 5, date: "2026-09-30", amount: 133.25 });
    expect(plan.leftAmount).toBe(1066);
    expect(plan.payoff).toBe("2027-04-30");
    expect(plan.done).toBe(false);
    expect(plan.progress).toBeCloseTo(4 / 12);
  });

  it("applies what you've set: name, icon, length and price", () => {
    const key = `${APPLE}|13325`;
    const prefs = resolveInstallmentPrefs({ detected: { [key]: { name: "MacBook Air", icon: "laptop", payments: 12, price: 1599 } }, added: [] });
    const [plan] = buildInstallmentPlans(mac, prefs, "2026-09-25");
    expect(plan).toMatchObject({ name: "MacBook Air", named: true, icon: "laptop", price: 1599 });
    // The last payment settles the rest of the price.
    expect(plan.schedule[11].amount).toBe(133.25);
    expect(plan.leftAmount).toBe(1066);
  });

  it("names an unnamed plan after its card", () => {
    const [plan] = buildInstallmentPlans(mac, none, "2026-09-25");
    expect(plan).toMatchObject({ name: "Apple Card installment", named: false, icon: "other" });
  });

  it("is done once the last payment's day passes", () => {
    const [plan] = buildInstallmentPlans(mac, resolveInstallmentPrefs({ detected: { [`${APPLE}|13325`]: { payments: 3 } } }), "2026-09-25");
    expect(plan).toMatchObject({ done: true, left: 0, leftAmount: 0, next: null });
  });

  it("never counts fewer payments than it has charges", () => {
    const [plan] = buildInstallmentPlans(mac, resolveInstallmentPrefs({ detected: { [`${APPLE}|13325`]: { payments: 2 } } }), "2026-09-25");
    expect(plan.payments).toBe(3);
  });

  it("keeps a hidden plan, marked hidden", () => {
    const [plan] = buildInstallmentPlans(mac, resolveInstallmentPrefs({ detected: { [`${APPLE}|13325`]: { hidden: true } } }), "2026-09-25");
    expect(plan.hidden).toBe(true);
  });

  it("matches a plan you added to charges of its amount near each payment day", () => {
    const affirm = [
      charge("2026-08-03", 45.5, { name: "Affirm", note: null, accountId: "checking", accountName: "Checking" }),
      charge("2026-09-02", 45.5, { name: "Affirm", note: null, accountId: "checking", accountName: "Checking" }),
    ];
    const prefs = resolveInstallmentPrefs({
      added: [{ id: "added-1", name: "Couch", icon: "other", monthly: 45.5, payments: 6, start: "2026-08-01", price: null }],
    });
    const [plan] = buildInstallmentPlans([...mac, ...affirm], prefs, "2026-09-25").filter((p) => p.source === "added");
    expect(plan.schedule.slice(0, 2).map((s) => s.charge?.date)).toEqual(["2026-08-03", "2026-09-02"]);
    expect(plan.paid).toBe(2);
    expect(plan.leftAmount).toBe(182);
  });

  it("puts unfinished plans first, soonest paid off first", () => {
    const prefs = resolveInstallmentPrefs({
      added: [
        { id: "a", name: "Done", icon: "other", monthly: 10, payments: 2, start: "2026-01-01", price: null },
        { id: "b", name: "Later", icon: "phone", monthly: 10, payments: 24, start: "2026-01-01", price: null },
        { id: "c", name: "Sooner", icon: "tablet", monthly: 20, payments: 12, start: "2026-01-01", price: null },
      ],
    });
    expect(buildInstallmentPlans([], prefs, "2026-09-25").map((p) => p.name)).toEqual(["Sooner", "Later", "Done"]);
  });
});

describe("resolveInstallmentPrefs", () => {
  it("falls back to nothing set for anything unreadable", () => {
    expect(resolveInstallmentPrefs("nonsense")).toEqual({ detected: {}, added: [] });
    expect(resolveInstallmentPrefs({ detected: 4, added: [{ bad: true }] })).toEqual({ detected: {}, added: [] });
  });
});

describe("paid off early, and the payments still to make", () => {
  const mac = [charge("2026-05-31", 133.25), charge("2026-06-30", 133.25), charge("2026-07-31", 133.25)];
  const key = `${APPLE}|13325`;

  it("lists the next payments of plans that are going, soonest first", () => {
    const plans = buildInstallmentPlans(mac, resolveInstallmentPrefs({ detected: { [key]: { name: "MacBook Air" } } }), "2026-09-25");
    const due = installmentPaymentsBetween(plans, "2026-09-25", "2026-11-05");
    expect(due.map((d) => d.payment.date)).toEqual(["2026-09-30", "2026-10-31"]);
    expect(installmentPaymentLabel(due[0])).toBe("MacBook Air · 5 of 12");
  });

  it("marks a plan paid off early as done, with nothing more due", () => {
    const prefs = resolveInstallmentPrefs({ detected: { [key]: { paidOff: "2026-09-20" } } });
    const [plan] = buildInstallmentPlans(mac, prefs, "2026-09-25");
    expect(plan).toMatchObject({ done: true, left: 0, leftAmount: 0, next: null, paidOff: "2026-09-20", payoff: "2026-09-20" });
    expect(installmentPaymentsBetween([plan], "2026-09-25", "2027-12-31")).toEqual([]);
  });

  it("leaves out a plan hidden as not an installment", () => {
    const [plan] = buildInstallmentPlans(mac, resolveInstallmentPrefs({ detected: { [key]: { hidden: true } } }), "2026-09-25");
    expect(installmentPaymentsBetween([plan], "2026-09-25", "2027-12-31")).toEqual([]);
  });
});

describe("installmentDueAlerts", () => {
  const mac = [charge("2026-05-31", 133.25), charge("2026-06-30", 133.25), charge("2026-07-31", 133.25)];
  const key = `${APPLE}|13325`;

  it("alerts for a payment due within the days ahead, once per payment", () => {
    const plans = buildInstallmentPlans(mac, resolveInstallmentPrefs({ detected: { [key]: { name: "MacBook Air" } } }), "2026-09-27");
    const [alert, ...rest] = installmentDueAlerts(installmentPaymentsBetween(plans, "2026-09-27", "2026-09-30"), "2026-09-27", "USD");
    expect(rest).toEqual([]);
    expect(alert).toMatchObject({
      key: `installment-due:${key}:2026-09-30`,
      kind: "installment-due",
      title: "MacBook Air payment in 3 days",
      body: "$133.25, payment 5 of 12 on Apple Card. 7 more after this.",
      href: "/recurring#installments",
    });
  });

  it("stops once the plan is paid off", () => {
    const plans = buildInstallmentPlans(mac, resolveInstallmentPrefs({ detected: { [key]: { paidOff: "2026-09-20" } } }), "2026-09-27");
    expect(installmentDueAlerts(installmentPaymentsBetween(plans, "2026-09-27", "2026-09-30"), "2026-09-27", "USD")).toEqual([]);
  });
});
