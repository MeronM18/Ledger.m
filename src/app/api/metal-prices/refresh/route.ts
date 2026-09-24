import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { refreshMetalPrices } from "@/lib/metal-prices";

function hasCronSecret(request: Request): boolean {
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

/**
 * Manual trigger — the "Refresh prices" button on /accounts. Auth is either a
 * logged-in session or the CRON_SECRET bearer header, same pattern as
 * /api/plaid/sync.
 */
export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    const auth = await requireApiUser();
    if ("error" in auth) return auth.error;
  }

  const results = await refreshMetalPrices();
  return NextResponse.json({ results });
}

/**
 * Vercel Cron issues a GET with the CRON_SECRET as a Bearer header — same
 * pattern as /api/plaid/sync's GET handler.
 */
export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await refreshMetalPrices();
  return NextResponse.json({ results });
}
