import { describe, expect, it } from "vitest";
import { categorize, cleanPayee, parseAppleCardCsv, parseCsv, parseUsDate } from "@/lib/apple-card-import";

const HEADER = "Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("parseCsv", () => {
  it("handles quotes, commas inside quotes, doubled quotes, CRLF, and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parseUsDate", () => {
  it("reads MM/DD/YYYY and rejects impossible dates", () => {
    expect(parseUsDate("09/23/2026")).toBe("2026-09-23");
    expect(parseUsDate("1/5/2026")).toBe("2026-01-05");
    expect(parseUsDate("02/30/2026")).toBeNull();
    expect(parseUsDate("2026-09-23")).toBeNull();
  });
});

describe("cleanPayee", () => {
  it("drops street addresses, reference numbers and the return tag", () => {
    expect(cleanPayee("Utica Rng Ops Llc 21420 Hall Road Utica 48038 Mi Usa (dispute", "UTICA RNG OPS LLC 21420 HALL ROAD (DISPUTE)")).toEqual({ name: "Utica Rng Ops Llc", tag: "dispute" });
    expect(cleanPayee("Air Can0142320333107 14 Rue Lafayette Paris", "AIR CAN0142320333107 14 RUE LAFAYETTE (RETURN)").name).toBe("Air Can");
    expect(cleanPayee("Apple Services", "APPLE.COM/BILL ONE APPLE PARK WAY")).toEqual({ name: "Apple Services", tag: null });
    expect(cleanPayee("Apple.com/bill One Apple Park Way Cupertino", "APPLE.COM/BILL (REFUND)").name).toBe("Apple Services");
    expect(cleanPayee("Clip Mx*ng Operadora Blvd Kukulcan Kilometro", "CLIP MX*NG OPERADORA BLVD").name).toBe("Clip Mx*ng Operadora");
  });
});

describe("categorize", () => {
  const row = (o: Partial<Parameters<typeof categorize>[0]>) => ({ category: "Other", type: "Purchase", merchant: "", description: "", amount: 10, ...o });

  it("maps Apple's categories", () => {
    expect(categorize(row({ category: "Restaurants" }))).toBe("FOOD_AND_DRINK");
    expect(categorize(row({ category: "Grocery" }))).toBe("FOOD_AND_DRINK");
    expect(categorize(row({ category: "Gas" }))).toBe("TRANSPORTATION");
    expect(categorize(row({ category: "Airlines" }))).toBe("TRAVEL");
    expect(categorize(row({ category: "Govt-services-parking" }))).toBe("GOVERNMENT_AND_NON_PROFIT");
  });

  it("uses the merchant when Apple says Other", () => {
    expect(categorize(row({ merchant: "Apple Services" }))).toBe("GENERAL_SERVICES");
    expect(categorize(row({ merchant: "Amazon Marketplace" }))).toBe("GENERAL_MERCHANDISE");
    expect(categorize(row({ merchant: "Cvs/pharmacy #08191" }))).toBe("MEDICAL");
    expect(categorize(row({ merchant: "Something Unknown" }))).toBe("GENERAL_MERCHANDISE");
  });

  it("keeps payments and Daily Cash adjustments out of spending", () => {
    expect(categorize(row({ type: "Payment", category: "Payment", amount: -789.11 }))).toBe("TRANSFER_IN");
    expect(categorize(row({ type: "Debit", category: "Debit", description: "DAILY CASH ADJUSTMENT", amount: 0.6 }))).toBe("TRANSFER_OUT");
  });
});

describe("parseAppleCardCsv", () => {
  const sample = csv(
    '09/22/2026,09/23/2026,"APPLE.COM/BILL ONE APPLE PARK WAY CUPERTINO 95014 CA USA","Apple Services","Other","Purchase","2.99","Meron Matti"',
    '09/22/2026,09/23/2026,"APPLE.COM/BILL ONE APPLE PARK WAY CUPERTINO 95014 CA USA","Apple Services","Other","Purchase","2.99","Meron Matti"',
    '09/18/2026,09/18/2026,"ACH DEPOSIT INTERNET TRANSFER FROM ACCOUNT ENDING IN 3230","Ach Deposit","Payment","Payment","-789.11","Meron Matti"',
    '08/15/2026,08/16/2026,"UTICA RNG OPS LLC 21420 HALL ROAD UTICA 48038 MI USA (DISPUTE)","Utica Rng Ops Llc 21420 Hall R","Credit","Credit","-205.76","Meron Matti"'
  );

  it("reads every row into the app's shape and sign convention", () => {
    const { transactions, skipped } = parseAppleCardCsv(sample);
    expect(skipped).toEqual([]);
    expect(transactions).toHaveLength(4);
    expect(transactions[0]).toMatchObject({ date: "2026-09-22", name: "Apple Services", amount: 2.99, pfc_primary: "GENERAL_SERVICES" });
    expect(transactions[2]).toMatchObject({ name: "Payment to Apple Card", amount: -789.11, pfc_primary: "TRANSFER_IN" });
    expect(transactions[3]).toMatchObject({ name: "Utica Rng Ops Llc", amount: -205.76, notes: "Dispute" });
  });

  it("gives identical same-day rows different ids, and the same ids when imported again", () => {
    const a = parseAppleCardCsv(sample).transactions;
    expect(a[0].external_id).not.toBe(a[1].external_id);
    const b = parseAppleCardCsv(sample).transactions;
    expect(b.map((t) => t.external_id)).toEqual(a.map((t) => t.external_id));
  });

  it("nets to the balance owed: purchases minus payments and credits", () => {
    const { transactions } = parseAppleCardCsv(sample);
    expect(transactions.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(2.99 * 2 - 789.11 - 205.76);
  });

  it("rejects a file that isn't an Apple Card export, and reports bad rows without failing the rest", () => {
    expect(parseAppleCardCsv("a,b\n1,2").transactions).toEqual([]);
    expect(parseAppleCardCsv("a,b\n1,2").skipped[0].reason).toMatch(/Apple Card export/);
    const mixed = parseAppleCardCsv(csv('13/45/2026,x,"D","M","Other","Purchase","5.00","Me"', '09/01/2026,x,"D2","M2","Other","Purchase","6.00","Me"'));
    expect(mixed.transactions).toHaveLength(1);
    expect(mixed.skipped).toEqual([{ line: 2, reason: "Unreadable transaction date." }]);
  });

  it("notes an installment", () => {
    const { transactions } = parseAppleCardCsv(csv('09/01/2026,09/01/2026,"APPLE CARD MONTHLY INSTALLMENTS","Apple Store","Other","Purchase","83.29","Me"'));
    expect(transactions[0].notes).toBe("Apple Card Monthly Installment");
  });
});
