import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { syncAllActiveItems, syncItemTransactions } from "@/lib/plaid-sync";

const bodySchema = z.object({
  item_id: z.string().uuid().optional(),
});

function hasCronSecret(request: Request): boolean {
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

/**
 * Manual/internal trigger. Auth is either a logged-in session (the
 * "Sync now" button on /accounts) or the CRON_SECRET bearer header (so it
 * can also be curl'd directly for testing, same as /api/notify/test).
 */
export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    const auth = await requireApiUser();
    if ("error" in auth) return auth.error;
  }

  const rawBody = await request.text();
  let json: unknown = {};
  try {
    json = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // forceRefresh: true — this is the user-initiated path ("Sync now" /
  // "Sync all"), the exact moment someone is actively waiting and checking
  // "why isn't this here yet." /transactions/refresh forces Plaid to pull
  // fresh data from the institution instead of serving its own cache,
  // which can otherwise lag same-day activity by hours. It's a paid,
  // per-request endpoint, so it's deliberately NOT used on the free cron
  // backstop or webhook-driven syncs below — only here, where a human
  // explicitly asked for a fresh check.
  const results = parsed.data.item_id
    ? [await syncItemTransactions(parsed.data.item_id, { forceRefresh: true })]
    : await syncAllActiveItems({ forceRefresh: true });

  return NextResponse.json({ results });
}

/**
 * Vercel Cron always issues a GET request and (when a CRON_SECRET env var is
 * set) automatically sends it as the Authorization: Bearer header — see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 * This is the backstop path: syncs every active item against Plaid's own
 * cache, no forced refresh — Plaid's regular extraction schedule already
 * catches up on its own, and running a paid refresh automatically once a
 * day for every item isn't worth the extra cost for a backstop that's
 * mainly there in case a webhook was missed.
 */
export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAllActiveItems();
  return NextResponse.json({ results });
}
