import { DISPLAY_NAME } from "@/lib/config";

// Single-user app, and that user is in Michigan (America/Detroit uses the
// same Eastern rules as America/New_York) — pinned explicitly rather than
// using the server's own timezone (Vercel functions don't run in any
// particular zone, so `new Date().getHours()` would be meaningless) or the
// browser's (which would need a client component and reintroduce a
// hydration mismatch, since the server can't know it up front).
const TIME_ZONE = "America/New_York";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Server-rendered, not client-computed. /overview is already a force-
 * dynamic route (the auth cookie read in the dashboard layout guarantees
 * this — confirmed by the "ƒ" dynamic marker on `/` in every build this
 * session), so a plain `new Date()` here reflects the actual request time
 * on every load, not a value frozen at deploy/build time.
 */
export function GreetingHeader() {
  const now = new Date();
  const hour =
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hour12: false }).format(now)
    ) % 24; // Intl can format midnight as "24" rather than "00" in some environments

  const greeting = greetingForHour(hour);
  const dateLabel = now.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-serif text-2xl font-semibold text-bone">
        {greeting}, {DISPLAY_NAME}
      </h1>
      <p className="text-sm text-ash-grey">{dateLabel}</p>
    </div>
  );
}
