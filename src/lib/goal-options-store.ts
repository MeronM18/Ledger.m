import "server-only";
import { z } from "zod";
import { GOAL_COLORS, GOAL_ICONS, nextBaselines, resolveGoalOptions } from "@/lib/goal-options";
import { loadRefBalances } from "@/lib/goals-data";
import type { createAdminClient } from "@/lib/supabase/admin";
import { calendarNow } from "@/lib/time";
import { GOAL_OPTIONS_KEY } from "@/lib/ui-preferences";

type AdminClient = ReturnType<typeof createAdminClient>;

// "plaid:<uuid>", "manual:<uuid>" or "asset:<uuid>"; a handful at most.
export const accountRefsSchema = z.array(z.string().regex(/^(plaid|manual|asset):[0-9a-f-]{36}$/)).max(10);

export const goalOptionsSchema = z
  .object({
    icon: z.enum(GOAL_ICONS).nullable(),
    color: z.enum(GOAL_COLORS).nullable(),
    tracking: z.enum(["balance", "growth"]),
    shares: z.record(z.string(), z.number().min(1).max(100)),
  })
  .partial();

/**
 * Saves a goal's options after the goal itself. A growth goal keeps its
 * starting balances for accounts it already followed and starts today for
 * ones newly added; switching to growth starts every account today.
 */
export async function saveGoalOptions(
  admin: AdminClient,
  goalId: string,
  input: z.infer<typeof goalOptionsSchema> | undefined,
  refs: string[] | undefined
): Promise<{ error: boolean }> {
  if (!input && !refs) return { error: false };
  const { data, error: readError } = await admin.from("ui_preferences").select("value").eq("key", GOAL_OPTIONS_KEY).maybeSingle();
  if (readError) {
    console.error("Failed to load goal options", readError);
    return { error: true };
  }
  const all = resolveGoalOptions(data?.value);
  const current = all[goalId] ?? { icon: null, color: null, tracking: "balance" as const, shares: {}, baselines: {}, since: null };
  const tracking = input?.tracking ?? current.tracking;
  const followed = refs ?? Object.keys(current.baselines);
  const switched = tracking === "growth" && current.tracking !== "growth";
  const today = calendarNow().isoDate;

  let baselines = current.baselines;
  let since = current.since;
  if (tracking === "growth" && followed.length > 0) {
    const balances = await loadRefBalances(admin, followed);
    baselines = nextBaselines(followed, switched ? {} : current.baselines, balances);
    since = switched || !since ? today : since;
  } else if (tracking === "balance") {
    baselines = {};
    since = null;
  }

  all[goalId] = {
    icon: input?.icon !== undefined ? input.icon : current.icon,
    color: input?.color !== undefined ? input.color : current.color,
    tracking,
    // Shares only for accounts it still follows.
    shares: Object.fromEntries(Object.entries(input?.shares ?? current.shares).filter(([ref, pct]) => followed.includes(ref) && pct < 100)),
    baselines,
    since,
  };
  const { error } = await admin.from("ui_preferences").upsert({ key: GOAL_OPTIONS_KEY, value: all }, { onConflict: "key" });
  if (error) console.error("Failed to save goal options", error);
  return { error: Boolean(error) };
}

/** Drops a deleted goal's options. */
export async function removeGoalOptions(admin: AdminClient, goalId: string): Promise<void> {
  const { data } = await admin.from("ui_preferences").select("value").eq("key", GOAL_OPTIONS_KEY).maybeSingle();
  const all = resolveGoalOptions(data?.value);
  if (!(goalId in all)) return;
  delete all[goalId];
  const { error } = await admin.from("ui_preferences").upsert({ key: GOAL_OPTIONS_KEY, value: all }, { onConflict: "key" });
  if (error) console.error("Failed to remove goal options", error);
}
