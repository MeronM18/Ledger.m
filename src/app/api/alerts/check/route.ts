import { NextResponse } from "next/server";
import { runAlertChecks } from "@/lib/alerts";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";

function hasCronSecret(request: Request): boolean {
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

async function run() {
  try {
    return NextResponse.json({ ok: true, ...(await runAlertChecks()) });
  } catch (err) {
    console.error("Alert check failed", err);
    return NextResponse.json({ error: "Alert check failed" }, { status: 500 });
  }
}

// Manual trigger: a logged-in session or the CRON_SECRET bearer header.
export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    const auth = await requireApiUser();
    if ("error" in auth) return auth.error;
  }
  return run();
}

// Vercel Cron issues a GET with the CRON_SECRET as a Bearer header.
export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}
