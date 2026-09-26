import { z } from "zod";
import type { DetectedSubscription } from "@/lib/recurring-detection";

// Recurring charges Ledger.m found on its own that you said aren't
// subscriptions. (Cancelling one is kept with every other subscription's,
// in subscription-review.ts; `cancelled` here is from before that, read as
// the day it was cancelled.)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  dismissed: z.array(z.string().max(200)).max(500).catch([]),
  cancelled: z.record(z.string().max(200), isoDate).catch({}),
});
export type FoundRecurringPrefs = z.infer<typeof schema>;

export function resolveFoundRecurring(raw: unknown): FoundRecurringPrefs {
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { dismissed: [], cancelled: {} };
}

export type FoundAction = { key: string; action: "dismiss" | "restore" };

export function applyFoundAction(prefs: FoundRecurringPrefs, { key, action }: FoundAction): FoundRecurringPrefs {
  const dismissed = prefs.dismissed.filter((k) => k !== key);
  if (action === "dismiss") dismissed.push(key);
  return { ...prefs, dismissed };
}

export type FoundRow = DetectedSubscription & {
  institution: string | null;
  // You said it's cancelled, and on what day.
  cancelledOn: string | null;
};

// A found charge that stopped long ago isn't worth listing.
const STOPPED_SHOWN_DAYS = 365;

/**
 * The found recurring charges to list: not dismissed, and not long
 * stopped. `active` then means it's still charging and you haven't
 * cancelled it.
 */
export function foundRecurring(
  detected: DetectedSubscription[],
  opts: {
    prefs: FoundRecurringPrefs;
    cancelledOn: (key: string) => string | null;
    todayIso: string;
    institutionOf: (accountId: string | null) => string | null;
  }
): FoundRow[] {
  const dismissed = new Set(opts.prefs.dismissed);
  const today = Date.parse(`${opts.todayIso}T00:00:00Z`);
  return detected
    .filter((d) => !dismissed.has(d.key))
    .filter((d) => d.active || (today - Date.parse(`${d.lastDate}T00:00:00Z`)) / 86_400_000 <= STOPPED_SHOWN_DAYS)
    .map((d) => {
      const cancelledOn = opts.cancelledOn(d.key) ?? opts.prefs.cancelled[d.key] ?? null;
      return { ...d, active: d.active && !cancelledOn, institution: opts.institutionOf(d.accountId), cancelledOn };
    });
}
