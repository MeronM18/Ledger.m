import { calendarNow } from "@/lib/time";

// Pure date wording for statement imports, kept apart from
// import-reminders.ts (which validates stored records with zod) so the
// browser can use them without loading zod.

/** The Eastern calendar day of a timestamp. */
export function easternDateOf(timestamp: string): string {
  return calendarNow(new Date(timestamp)).isoDate;
}

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function daysAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
