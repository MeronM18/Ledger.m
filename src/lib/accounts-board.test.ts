import { describe, expect, it } from "vitest";
import { changeOver, dailyBalances, periodStart, thin } from "@/lib/account-history";
import { buildBoard, historyStartFor, netWorthSeries, summarize, type BoardInput } from "@/lib/accounts-board";

describe("dailyBalances", () => {
  it("walks a checking account back through what went out and came in", () => {
    // Today 1000. Yesterday $50 went out, the day before $200 came in.
    const series = dailyBalances(
      1000,
      "asset",
      [
        { date: "2026-09-23", amount: 50 },
        { date: "2026-09-22", amount: -200 },
      ],
      "2026-09-20",
      "2026-09-23"
    );
    expect(series).toEqual([850, 850, 1050, 1000]);
  });

  it("walks a card's balance owed back: a charge added to it, a payment took it down", () => {
    const series = dailyBalances(
      300,
      "liability",
      [
        { date: "2026-09-23", amount: 100 }, // charge
        { date: "2026-09-22", amount: -500 }, // payment
      ],
      "2026-09-21",
      "2026-09-23"
    );
    expect(series).toEqual([700, 200, 300]);
  });

  it("skips pending charges and anything outside the window", () => {
    const series = dailyBalances(
      100,
      "asset",
      [
        { date: "2026-09-23", amount: 40, pending: true },
        { date: "2026-09-10", amount: 999 },
      ],
      "2026-09-21",
      "2026-09-23"
    );
    expect(series).toEqual([100, 100, 100]);
  });
});

describe("periods", () => {
  it("measures change over the last n days of a series", () => {
    expect(changeOver([10, 20, 35, 50], 2)).toBe(30);
    expect(changeOver([10, 20], 30)).toBe(10);
  });

  it("starts a period n days back, or at the history start for all time", () => {
    expect(periodStart("1M", "2026-09-24", "2025-01-01")).toBe("2026-08-25");
    expect(periodStart("ALL", "2026-09-24", "2025-06-01")).toBe("2025-06-01");
  });

  it("thins a long series but keeps its ends", () => {
    const t = thin(Array.from({ length: 100 }, (_, i) => i), 10);
    expect(t).toHaveLength(10);
    expect(t[0]).toBe(0);
    expect(t.at(-1)).toBe(99);
  });
});

describe("buildBoard", () => {
  const input: BoardInput = {
    plaid: [
      { id: "chk", name: "Checking", official_name: null, mask: "3230", type: "depository", subtype: "checking", current_balance: 1000, credit_limit: null, apy: null, institution: "Fifth Third Bank", last_synced_at: null },
      { id: "cc", name: "Card", official_name: "Chase Freedom Flex", mask: "7788", type: "credit", subtype: "credit card", current_balance: 250, credit_limit: 1000, apy: null, institution: "Chase", last_synced_at: null },
      { id: "gone", name: "Hidden", official_name: null, mask: null, type: "depository", subtype: "savings", current_balance: 5, credit_limit: null, apy: null, is_hidden: true, institution: "Chase", last_synced_at: null },
    ],
    manualAccounts: [
      { id: "ac", type: "credit", name: "Apple Card", institution_name: "Apple", mask: null, credit_limit: 2000, apy: null, balance: -20, balanceKnown: true, lastImportedAt: null },
      { id: "as", type: "depository", name: "Apple Savings", institution_name: "Apple", mask: null, credit_limit: null, apy: 3.4, balance: 0, balanceKnown: false, lastImportedAt: null },
    ],
    assets: [
      { id: "car", name: "Honda Civic", category: "vehicle", value: 12000, is_liability: false },
      { id: "cash", name: "Cash", category: "cash", value: 300, is_liability: false },
      { id: "loan", name: "Car loan", category: "vehicle", value: 4000, is_liability: true },
    ],
    metals: { value: 500, count: 2, pricedAt: null },
    settings: { cc: { nickname: null, statementCloseDay: 3, paymentDueDay: 28 } },
    transactions: new Map([["chk", [{ date: "2026-09-23", amount: 50 }]]]),
    todayIso: "2026-09-24",
    historyStart: "2026-09-21",
  };
  const rows = buildBoard(input);
  const row = (id: string) => rows.find((r) => r.id === id)!;

  it("groups by what an account is, not which bank it's at", () => {
    expect(row("chk").group).toBe("cash");
    expect(row("asset:cash").group).toBe("cash");
    expect(row("cc").group).toBe("credit");
    expect(row("manual:ac").group).toBe("credit");
    expect(row("metals").group).toBe("investments");
    expect(row("asset:car").group).toBe("property");
    expect(row("asset:loan")).toMatchObject({ group: "loans", liability: true });
  });

  it("leaves out hidden accounts and a savings account with no balance entered, like net worth does", () => {
    expect(rows.find((r) => r.id === "gone")).toBeUndefined();
    expect(rows.find((r) => r.id === "manual:as")).toBeUndefined();
  });

  it("describes a card with its product name, how much of the limit is used and its statement days", () => {
    expect(row("cc").name).toBe("Chase Freedom Flex");
    expect(row("cc").detail).toBe("Chase · Credit card · 25% of $1,000.00 · closes the 3rd · due the 28th");
    // An overpaid Apple Card owes nothing.
    expect(row("manual:ac").balance).toBe(0);
  });

  it("totals net worth the same way everywhere, and the line ends on it", () => {
    const s = summarize(rows);
    expect(s.totalAssets).toBe(1000 + 300 + 12000 + 500);
    expect(s.totalLiabilities).toBe(250 + 4000);
    expect(s.netWorth).toBe(13800 - 4250);
    expect(s.assets[0]).toEqual({ kind: "Vehicles", amount: 12000 });
    const line = netWorthSeries(rows);
    expect(line.at(-1)).toBe(s.netWorth);
    // Before yesterday's $50 went out of checking, net worth was $50 higher.
    expect(line[0] - line.at(-1)!).toBe(50);
  });

  it("starts the history the day before the oldest transaction, within the limit", () => {
    const tx = new Map([["a", [{ date: "2026-09-01", amount: 1 }]]]);
    expect(historyStartFor(tx, "2026-09-24", 730)).toBe("2026-08-31");
    expect(historyStartFor(tx, "2026-09-24", 10)).toBe("2026-09-14");
  });
});
