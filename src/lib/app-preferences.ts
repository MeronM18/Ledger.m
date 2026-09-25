import { ALERT_THRESHOLDS, DISPLAY_NAME } from "@/lib/config";

// Pure. Settings you can change on the Settings page, read back from
// ui_preferences. Anything missing or out of range falls back to the
// defaults in config.ts, so a bad value never breaks alerts or a page.

export type AlertThresholds = {
  // A single charge at or above this gets its own push.
  largeCharge: number;
  // A checking or savings balance under this sets off a low-balance alert.
  lowBalance: number;
  // A subscription renewing within this many days gets a heads-up.
  renewalDaysAhead: number;
};

export const THRESHOLD_LIMITS: Record<keyof AlertThresholds, { min: number; max: number }> = {
  largeCharge: { min: 1, max: 100_000 },
  lowBalance: { min: 0, max: 100_000 },
  renewalDaysAhead: { min: 1, max: 30 },
};

export const DEFAULT_THRESHOLDS: AlertThresholds = { ...ALERT_THRESHOLDS };

export function resolveAlertThresholds(stored: unknown): AlertThresholds {
  const raw = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const out = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(THRESHOLD_LIMITS) as (keyof AlertThresholds)[]) {
    const v = raw[key];
    const { min, max } = THRESHOLD_LIMITS[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) {
      out[key] = key === "renewalDaysAhead" ? Math.round(v) : Math.round(v * 100) / 100;
    }
  }
  return out;
}

export const DISPLAY_NAME_MAX = 40;

/** The name in the Overview greeting: yours if set, else the default. */
export function resolveDisplayName(stored: unknown): string {
  if (typeof stored !== "string") return DISPLAY_NAME;
  const name = stored.trim().slice(0, DISPLAY_NAME_MAX);
  return name || DISPLAY_NAME;
}

/** "abc•••••": enough of a push topic to recognize it without handing it out (anyone with the topic can read the pushes). */
export function maskTopic(topic: string): string {
  if (topic.length <= 4) return "•".repeat(topic.length);
  return `${topic.slice(0, 3)}${"•".repeat(Math.min(8, topic.length - 3))}`;
}
