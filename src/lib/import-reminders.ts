import { z } from "zod";
import { daysAgo, easternDateOf, longDate } from "@/lib/import-dates";

// Shared with the browser from import-dates.ts, which has no zod in it.
export { daysAgo, easternDateOf, longDate } from "@/lib/import-dates";
import type { Alert } from "@/lib/alerts-logic";

// Pure. Apple Card and Apple Savings can't sync, so their statements are
// imported by hand. Every import is logged with its date; once an account's
// last import is two weeks old, the app reminds you (a banner, and a push
// each day) until you import again, which starts the two weeks over.

export const IMPORT_REMINDER_DAYS = 14;
// How many imports each account's history keeps.
const HISTORY_LIMIT = 50;

const recordSchema = z.object({
  at: z.string(), // when the import ran (ISO timestamp)
  added: z.number(), // transactions new to the app
  total: z.number(), // transactions in the file
  from: z.string().nullable(), // the file's first and last transaction dates
  to: z.string().nullable(),
});

export type ImportRecord = z.infer<typeof recordSchema>;
// By manual account id, newest first.
export type ImportLog = Record<string, ImportRecord[]>;

/** The stored log (possibly missing or malformed), keeping only well-formed records. */
export function resolveImportLog(stored: unknown): ImportLog {
  if (!stored || typeof stored !== "object") return {};
  const log: ImportLog = {};
  for (const [id, records] of Object.entries(stored as Record<string, unknown>)) {
    if (!Array.isArray(records)) continue;
    log[id] = records.flatMap((r) => {
      const parsed = recordSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }
  return log;
}

/** The log with one more import for an account. */
export function withImport(log: ImportLog, accountId: string, record: ImportRecord): ImportLog {
  return { ...log, [accountId]: [record, ...(log[accountId] ?? [])].slice(0, HISTORY_LIMIT) };
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOfDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export type ImportStatus = {
  lastImportDate: string; // Eastern calendar day
  daysSince: number;
  dueDate: string; // the day reminders start
  overdue: boolean;
};

/** Where an account stands, or null if it has never been imported. */
export function importStatus(lastImportedAt: string | null, today: string): ImportStatus | null {
  if (!lastImportedAt) return null;
  const lastImportDate = easternDateOf(lastImportedAt);
  const daysSince = dayNumber(today) - dayNumber(lastImportDate);
  return {
    lastImportDate,
    daysSince,
    dueDate: isoOfDay(dayNumber(lastImportDate) + IMPORT_REMINDER_DAYS),
    overdue: daysSince >= IMPORT_REMINDER_DAYS,
  };
}

/**
 * One push a day for each account due for an import. The key carries the
 * last import's date and today's, so a new import (a new last date) stops
 * them, and each day while it's due is its own push.
 */
export function importReminderAlerts(
  accounts: { id: string; name: string; lastImportedAt: string | null }[],
  today: string
): Alert[] {
  return accounts.flatMap((a) => {
    const status = importStatus(a.lastImportedAt, today);
    if (!status?.overdue) return [];
    return [
      {
        key: `import-reminder:${a.id}:${status.lastImportDate}:${today}`,
        kind: "import-reminder" as const,
        title: `Import your ${a.name} statement`,
        body: `Last imported ${longDate(status.lastImportDate)} (${daysAgo(status.daysSince)}). Export the CSV from Wallet and import it on the Accounts page.`,
      },
    ];
  });
}
