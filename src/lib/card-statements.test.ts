import { describe, expect, it } from "vitest";
import {
  breakdownForPayment,
  cardForBankPayment,
  closeDayFor,
  closeDayFromDueDay,
  estimateCloseDay,
  statementBefore,
  type Card,
  type CardTx,
} from "@/lib/card-statements";

let n = 0;
const tx = (account: string, date: string, amount: number, o: Partial<CardTx> = {}): CardTx => ({
  id: `t${++n}`,
  account: { id: account },
  date,
  amount,
  pfc_primary: "FOOD_AND_DRINK",
  merchant_name: "Shop",
  name: null,
  pending: false,
  ...o,
});
const pay = (account: string, date: string, amount: number) =>
  tx(account, date, -amount, { pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", merchant_name: "Payment Thank You" });

const flex: Card = { id: "flex", name: "Freedom Flex", closeDay: 3, dueDay: 28 };
const sapphire: Card = { id: "sapphire", name: "Sapphire Preferred", closeDay: null, dueDay: 23 };

describe("statementBefore", () => {
  it("pays the statement that closed most recently, however early the payment", () => {
    expect(statementBefore("2026-09-20", 3)).toEqual({ start: "2026-08-04", end: "2026-09-03", nextEnd: "2026-10-03" });
    expect(statementBefore("2026-09-04", 3).end).toBe("2026-09-03");
    // On the closing day itself, that day's statement isn't out yet.
    expect(statementBefore("2026-09-03", 3).end).toBe("2026-08-03");
  });

  it("uses the last day of a shorter month for a 29th-31st closing day", () => {
    expect(statementBefore("2026-03-10", 31)).toEqual({ start: "2026-02-01", end: "2026-02-28", nextEnd: "2026-03-31" });
  });
});

describe("closing day", () => {
  it("estimates about 25 days before the due date", () => {
    expect(closeDayFromDueDay(28)).toBe(3);
    expect(closeDayFromDueDay(23)).toBe(29);
  });

  it("works it out from payments that each paid off a statement", () => {
    const history = [
      tx("s", "2026-06-05", 100), tx("s", "2026-06-20", 50), pay("s", "2026-07-10", 150),
      tx("s", "2026-07-02", 80), tx("s", "2026-07-25", 20), pay("s", "2026-08-12", 100),
      tx("s", "2026-08-01", 60), tx("s", "2026-08-27", 40), pay("s", "2026-09-15", 100),
      tx("s", "2026-08-30", 999), // after the last statement closed
    ];
    // The 27th, 28th and 29th fit these payments equally; the due date breaks the tie.
    expect([27, 28, 29]).toContain(estimateCloseDay(history));
    expect(closeDayFor(sapphire, history)).toEqual({ day: 29, source: "payments" });
  });

  it("prefers what you set, then payments, then the due date", () => {
    expect(closeDayFor(flex, [])).toEqual({ day: 3, source: "set" });
    expect(closeDayFor(sapphire, [])).toEqual({ day: 29, source: "due-date" });
    expect(closeDayFor({ id: "apple", name: "Apple Card", closeDay: null, dueDay: null, closesAtMonthEnd: true }, [])).toEqual({ day: 31, source: "month-end" });
  });
});

describe("breakdownForPayment", () => {
  const txs = [
    tx("flex", "2026-08-02", 999), // previous statement
    tx("flex", "2026-08-10", 300),
    tx("flex", "2026-08-20", 200, { merchant_name: "Store", pfc_primary: "GENERAL_MERCHANDISE" }),
    tx("flex", "2026-08-25", -50, { merchant_name: "Store", pfc_primary: "GENERAL_MERCHANDISE" }), // a refund
    tx("flex", "2026-09-05", 75), // next statement
    pay("flex", "2026-09-10", 300),
    pay("flex", "2026-09-20", 150),
  ];

  it("lists the statement's charges and every payment toward it", () => {
    const b = breakdownForPayment(flex, "2026-09-20", txs)!;
    expect(b).toMatchObject({ start: "2026-08-04", end: "2026-09-03", total: 450, paid: 450, closeDaySource: "set" });
    expect(b.charges.map((c) => c.amount)).toEqual([-50, 200, 300]);
    expect(b.payments.map((p) => p.date)).toEqual(["2026-09-10", "2026-09-20"]);
  });
});

describe("cardForBankPayment", () => {
  it("tells two cards at the same bank apart by the payment landing on one of them", () => {
    const txs = [pay("flex", "2026-09-11", 450), pay("sapphire", "2026-09-10", 450.5)];
    const fromChecking = tx("checking", "2026-09-10", 450, { pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", merchant_name: "Chase Credit Card" });
    expect(cardForBankPayment(fromChecking, [flex, sapphire], txs)?.card.id).toBe("flex");
    expect(cardForBankPayment({ ...fromChecking, amount: 12 }, [flex, sapphire], txs)).toBeNull();
  });
});

describe("Chase's card-side payments, filed by Plaid as Loan Disbursements", () => {
  // As Plaid sends them: no merchant, the raw description, LOAN_DISBURSEMENTS.
  const chasePay = (account: string, date: string, amount: number) =>
    tx(account, date, -amount, { pfc_primary: "LOAN_DISBURSEMENTS", pfc_detailed: "LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT", merchant_name: null, name: "Payment Thank You-Mobile" });
  const fromChecking = (date: string, amount: number) =>
    tx("checking", date, amount, { pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", merchant_name: "Chase Credit Card" });

  const txs = [
    tx("sapphire", "2026-08-10", 300),
    tx("sapphire", "2026-08-20", 150, { pfc_primary: "GENERAL_MERCHANDISE" }),
    chasePay("sapphire", "2026-08-16", 7941.38), // paid the statement before
    chasePay("sapphire", "2026-09-21", 450),
  ];
  const card = { ...sapphire, closeDay: 29 };

  it("counts them as payments, not charges", () => {
    const b = breakdownForPayment(card, "2026-09-21", txs)!;
    expect(b.charges.map((c) => c.amount)).toEqual([150, 300]);
    expect(b).toMatchObject({ total: 450, paid: 450 });
  });

  it("matches the checking side of the payment to the card", () => {
    expect(cardForBankPayment(fromChecking("2026-09-21", 450), [flex, card], txs)?.card.id).toBe("sapphire");
  });

  it("counts the payment you clicked when the card's copy isn't there, and only once when it is", () => {
    const withoutCardSide = txs.filter((t) => t.date !== "2026-09-21");
    expect(breakdownForPayment(card, "2026-09-21", withoutCardSide, fromChecking("2026-09-21", 450))!.paid).toBe(450);
    expect(breakdownForPayment(card, "2026-09-21", txs, fromChecking("2026-09-20", 450))!.paid).toBe(450);
  });

  it("sums the statement by category, largest first", () => {
    expect(breakdownForPayment(card, "2026-09-21", txs)!.byCategory).toEqual([
      { category: "FOOD_AND_DRINK", amount: 300 },
      { category: "GENERAL_MERCHANDISE", amount: 150 },
    ]);
  });
});
