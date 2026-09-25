import type { ProgramId } from "@/lib/card-rewards";
import { prettyName } from "@/lib/transaction-display";

// Pure. What the user has told the app about a connected account that the
// bank doesn't: a name of their own and, for a credit card, the day its
// statement closes and the day payment is due. Kept by account id in
// ui_preferences, so nothing here is overwritten by a sync.

export type AccountSetting = {
  nickname?: string | null;
  statementCloseDay?: number | null; // 1-31; the last day of shorter months stands in for 29-31
  paymentDueDay?: number | null;
  // A credit card's rewards program when its name doesn't say ("none" for a
  // card that earns nothing); unset, it's recognized by name.
  rewardsProgram?: ProgramId | "none" | null;
};

export const REWARDS_CHOICES = ["sapphire-preferred", "freedom-flex", "apple-card", "none"] as const;

export type AccountSettings = Record<string, AccountSetting>;

export function resolveAccountSettings(stored: unknown): AccountSettings {
  if (!stored || typeof stored !== "object") return {};
  const out: AccountSettings = {};
  const day = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31 ? v : null);
  for (const [id, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    out[id] = {
      nickname: typeof r.nickname === "string" && r.nickname.trim() ? r.nickname.trim() : null,
      statementCloseDay: day(r.statementCloseDay),
      paymentDueDay: day(r.paymentDueDay),
      rewardsProgram: (REWARDS_CHOICES as readonly unknown[]).includes(r.rewardsProgram) ? (r.rewardsProgram as ProgramId | "none") : null,
    };
  }
  return out;
}

// Names a bank gives an account that say what it is but not which one.
const GENERIC = /^(credit card|checking|savings|card|account)$/i;

/**
 * An account's name: yours if you set one; otherwise the product name when
 * the bank's own name is generic ("Credit Card" but officially "Chase
 * Freedom Flex"); otherwise the bank's name.
 */
export function accountName(
  account: { name: string; official_name?: string | null },
  setting?: AccountSetting
): string {
  if (setting?.nickname) return setting.nickname;
  if (GENERIC.test(account.name.trim()) && account.official_name?.trim()) return prettyName(account.official_name.trim());
  return prettyName(account.name);
}
