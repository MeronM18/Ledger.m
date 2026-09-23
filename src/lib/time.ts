// The one real user is in Michigan, so "today" and "this month" mean the
// Eastern calendar, never the server's clock (Vercel runs in UTC, which is
// already "tomorrow" for the last hours of every evening and flips the
// month a few hours early on the last day).
export const APP_TIME_ZONE = "America/New_York";

export type CalendarNow = {
  year: number;
  month: number; // 0-indexed, matches Date#getMonth()
  isoDate: string; // YYYY-MM-DD
  monthLabel: string; // e.g. "September 2026"
};

export function calendarNow(now: Date = new Date()): CalendarNow {
  const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(now);
  const [year, month] = isoDate.split("-").map(Number);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  return { year, month: month - 1, isoDate, monthLabel };
}

/**
 * A Date at local midnight of today's Eastern calendar day. Date-only math
 * (whole-day comparisons, month stepping) elsewhere truncates to the start
 * of a day using the runtime's own zone, so handing it this — instead of a
 * raw `new Date()` — makes "today" the Eastern day on a UTC server and in a
 * browser alike.
 */
export function easternToday(now: Date = new Date()): Date {
  const [year, month, day] = calendarNow(now).isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}
