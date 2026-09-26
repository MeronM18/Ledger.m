import { z } from "zod";
import { newDetections, sameName, type DetectedSubscription } from "@/lib/recurring-detection";

// What you've said about recurring charges Ledger.m found on its own:
// ones that aren't subscriptions, and ones you've cancelled (with the day of
// the last charge then, so a charge after it shows it started again).

const schema = z.object({
  dismissed: z.array(z.string().max(200)).max(500).catch([]),
  cancelled: z.record(z.string().max(200), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).catch({}),
});
export type FoundRecurringPrefs = z.infer<typeof schema>;

export function resolveFoundRecurring(raw: unknown): FoundRecurringPrefs {
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { dismissed: [], cancelled: {} };
}

export type FoundAction = { key: string; action: "dismiss" | "cancel" | "restore"; lastDate?: string };

export function applyFoundAction(prefs: FoundRecurringPrefs, { key, action, lastDate }: FoundAction): FoundRecurringPrefs {
  const dismissed = prefs.dismissed.filter((k) => k !== key);
  const cancelled = { ...prefs.cancelled };
  delete cancelled[key];
  if (action === "dismiss") dismissed.push(key);
  if (action === "cancel" && lastDate) cancelled[key] = lastDate;
  return { dismissed, cancelled };
}

export type FoundRow = DetectedSubscription & {
  institution: string | null;
  // You marked it cancelled, and it hasn't charged since.
  cancelledByYou: boolean;
  // You'd marked it (or the bank's copy of it) cancelled, and it charged again.
  chargedAfterCancel: boolean;
};

// A found charge that stopped long ago isn't worth listing.
const STOPPED_SHOWN_DAYS = 365;

/**
 * The found recurring charges to list: not already tracked by the bank or
 * by you, not dismissed, and not long stopped; with what you've said about
 * cancelling applied. `active` then means it counts toward your totals.
 */
export function foundRecurring(
  detected: DetectedSubscription[],
  opts: {
    tracked: string[];
    // Ones you marked cancelled elsewhere (the bank's copy, or one you added), with their last charge when known.
    cancelledElsewhere: { name: string; lastDate: string | null }[];
    prefs: FoundRecurringPrefs;
    todayIso: string;
    institutionOf: (accountId: string | null) => string | null;
  }
): FoundRow[] {
  const dismissed = new Set(opts.prefs.dismissed);
  const today = Date.parse(`${opts.todayIso}T00:00:00Z`);
  return newDetections(detected, opts.tracked)
    .filter((d) => !dismissed.has(d.key))
    .filter((d) => d.active || (today - Date.parse(`${d.lastDate}T00:00:00Z`)) / 86_400_000 <= STOPPED_SHOWN_DAYS)
    .map((d) => {
      const cancelledAt = opts.prefs.cancelled[d.key];
      const cancelledByYou = Boolean(cancelledAt) && d.lastDate <= cancelledAt;
      const elsewhere = opts.cancelledElsewhere.some((c) => sameName(c.name, d.name) && (c.lastDate === null || d.lastDate > c.lastDate));
      return {
        ...d,
        active: d.active && !cancelledByYou,
        institution: opts.institutionOf(d.accountId),
        cancelledByYou,
        chargedAfterCancel: d.active && ((Boolean(cancelledAt) && !cancelledByYou) || elsewhere),
      };
    });
}
