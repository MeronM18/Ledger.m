import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { takeNetWorthSnapshot } from "@/lib/net-worth-snapshot";

function hasCronSecret(request: Request): boolean {
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

/**
 * Manual trigger. Auth is either a logged-in session or the CRON_SECRET
 * bearer header — same pattern as /api/metal-prices/refresh and
 * /api/plaid/sync.
 */
export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    const auth = await requireApiUser();
    if ("error" in auth) return auth.error;
  }

  const result = await takeNetWorthSnapshot();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}

/**
 * Vercel Cron issues a GET with the CRON_SECRET as a Bearer header — same
 * pattern as /api/plaid/sync and /api/metal-prices/refresh's GET handlers.
 */
export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await takeNetWorthSnapshot();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
