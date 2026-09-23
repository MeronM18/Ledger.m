import { prettyName } from "@/lib/transaction-display";

// Pure, dependency-free. Credit utilization is how much of a card's limit is
// in use; scoring models favor keeping it low (under 30% is the common
// guideline, under 10% the "excellent" end). This is a guide computed from
// the balance Plaid last returned, not a credit score: bureaus generally
// see the statement balance, which this app doesn't have.

export const GOOD_UTILIZATION = 0.3;
export const EXCELLENT_UTILIZATION = 0.1;
const FAIR_UTILIZATION = 0.5;

export type UtilizationBand = "excellent" | "good" | "fair" | "high";

export type CreditCard = {
  id: string;
  name: string;
  mask: string | null;
  institution: string | null;
  balance: number | null; // amount owed (Plaid reports it as a positive number)
  limit: number | null;
};

export type CardUtilization = {
  id: string;
  label: string;
  balance: number;
  limit: number;
  utilization: number; // 0..n, can exceed 1
  band: UtilizationBand;
  // Dollars to pay down to reach 30% / 10% (0 when already there).
  payDownToGood: number;
  payDownToExcellent: number;
};

export type UtilizationSummary = {
  cards: CardUtilization[]; // cards with a usable limit, highest utilization first
  unrated: CreditCard[]; // cards with no reported limit, so no utilization
  totalBalance: number;
  totalLimit: number;
  overall: number | null; // null when there is no card with a limit
  overallBand: UtilizationBand | null;
  overallPayDownToGood: number;
};

export function utilizationBand(utilization: number): UtilizationBand {
  if (utilization < EXCELLENT_UTILIZATION) return "excellent";
  if (utilization < GOOD_UTILIZATION) return "good";
  if (utilization < FAIR_UTILIZATION) return "fair";
  return "high";
}

export function payDownTo(balance: number, limit: number, target: number): number {
  return Math.max(0, balance - limit * target);
}

export function cardLabel(c: Pick<CreditCard, "name" | "mask" | "institution">): string {
  const name = prettyName(c.name);
  const base = c.institution && !name.toLowerCase().includes(c.institution.toLowerCase()) ? `${c.institution} ${name}` : name;
  return c.mask ? `${base} ••${c.mask}` : base;
}

/**
 * Per-card and overall utilization. A card with no reported limit (or a
 * zero one) can't be rated and is kept out of the overall figure rather
 * than counted as 0% or infinite. A negative balance (overpaid) counts as 0
 * owed, not as negative usage.
 */
export function summarizeUtilization(cards: CreditCard[]): UtilizationSummary {
  const rated: CardUtilization[] = [];
  const unrated: CreditCard[] = [];

  for (const c of cards) {
    if (c.limit === null || !(c.limit > 0)) {
      unrated.push(c);
      continue;
    }
    const balance = Math.max(0, c.balance ?? 0);
    const utilization = balance / c.limit;
    rated.push({
      id: c.id,
      label: cardLabel(c),
      balance,
      limit: c.limit,
      utilization,
      band: utilizationBand(utilization),
      payDownToGood: payDownTo(balance, c.limit, GOOD_UTILIZATION),
      payDownToExcellent: payDownTo(balance, c.limit, EXCELLENT_UTILIZATION),
    });
  }

  rated.sort((a, b) => b.utilization - a.utilization);

  const totalBalance = rated.reduce((s, c) => s + c.balance, 0);
  const totalLimit = rated.reduce((s, c) => s + c.limit, 0);
  const overall = totalLimit > 0 ? totalBalance / totalLimit : null;

  return {
    cards: rated,
    unrated,
    totalBalance,
    totalLimit,
    overall,
    overallBand: overall === null ? null : utilizationBand(overall),
    overallPayDownToGood: totalLimit > 0 ? payDownTo(totalBalance, totalLimit, GOOD_UTILIZATION) : 0,
  };
}
