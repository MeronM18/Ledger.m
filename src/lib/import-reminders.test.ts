import { describe, expect, it } from "vitest";
import {
  easternDateOf,
  importReminderAlerts,
  importStatus,
  resolveImportLog,
  withImport,
  type ImportRecord,
} from "@/lib/import-reminders";

const record = (at: string, added = 10): ImportRecord => ({ at, added, total: added, from: "2026-08-01", to: "2026-08-31" });

describe("import log", () => {
  it("adds each import newest first, per account", () => {
    let log = withImport({}, "card", record("2026-09-10T15:00:00Z"));
    log = withImport(log, "card", record("2026-09-24T15:00:00Z"));
    log = withImport(log, "savings", record("2026-09-24T16:00:00Z"));
    expect(log.card.map((r) => r.at)).toEqual(["2026-09-24T15:00:00Z", "2026-09-10T15:00:00Z"]);
    expect(log.savings).toHaveLength(1);
  });

  it("keeps the well-formed records of a stored log and drops the rest", () => {
    expect(resolveImportLog(null)).toEqual({});
    expect(resolveImportLog({ card: [record("2026-09-24T15:00:00Z"), { at: 5 }], savings: "nope" })).toEqual({
      card: [record("2026-09-24T15:00:00Z")],
    });
  });
});

describe("importStatus", () => {
  it("dates an import by the Eastern calendar", () => {
    // 11pm in Michigan on the 23rd is already the 24th in UTC.
    expect(easternDateOf("2026-09-24T03:00:00Z")).toBe("2026-09-23");
  });

  it("is due 14 days after the last import, and stays due until the next one", () => {
    const at = "2026-09-24T15:00:00Z";
    expect(importStatus(at, "2026-09-24")).toEqual({ lastImportDate: "2026-09-24", daysSince: 0, dueDate: "2026-10-08", overdue: false });
    expect(importStatus(at, "2026-10-07")?.overdue).toBe(false);
    expect(importStatus(at, "2026-10-08")?.overdue).toBe(true);
    expect(importStatus(at, "2026-11-01")?.overdue).toBe(true);
    expect(importStatus(null, "2026-11-01")).toBeNull();
  });
});

describe("importReminderAlerts", () => {
  const accounts = [
    { id: "card", name: "Apple Card", lastImportedAt: "2026-09-24T15:00:00Z" },
    { id: "savings", name: "Apple Savings", lastImportedAt: "2026-09-10T15:00:00Z" },
    { id: "new", name: "Nothing yet", lastImportedAt: null },
  ];

  it("reminds only for accounts two weeks past their last import", () => {
    const alerts = importReminderAlerts(accounts, "2026-09-26");
    expect(alerts).toEqual([
      {
        key: "import-reminder:savings:2026-09-10:2026-09-26",
        kind: "import-reminder",
        title: "Import your Apple Savings statement",
        body: "Last imported Sep 10, 2026 (16 days ago). Export the CSV from Wallet and import it on the Accounts page.",
      },
    ]);
  });

  it("repeats each day until an import, which restarts the two weeks", () => {
    const day1 = importReminderAlerts(accounts, "2026-09-26")[0].key;
    const day2 = importReminderAlerts(accounts, "2026-09-27")[0].key;
    expect(day1).not.toBe(day2);
    const imported = [{ ...accounts[1], lastImportedAt: "2026-09-27T18:00:00Z" }];
    expect(importReminderAlerts(imported, "2026-09-27")).toEqual([]);
    expect(importReminderAlerts(imported, "2026-10-11")).toHaveLength(1);
  });
});
