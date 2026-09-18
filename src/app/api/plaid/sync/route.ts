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

  const results = parsed.data.item_id
    ? [await syncItemTransactions(parsed.data.item_id)]
    : await syncAllActiveItems();

  return NextResponse.json({ results });
}

/**
 * Vercel Cron always issues a GET request and (when a CRON_SECRET env var is
 * set) automatically sends it as the Authorization: Bearer header — see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 * This is the backstop path: syncs every active item.
 */
export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAllActiveItems();
  return NextResponse.json({ results });
}
