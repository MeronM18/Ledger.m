import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sendNotification } from "@/lib/notify";

// Guarded by CRON_SECRET rather than requireUser() so it can be curl'd
// directly to confirm ntfy delivery, the same way future cron-triggered
// routes (webhook backfills, scheduled syncs) will be guarded.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendNotification("Ledger test", "This is a test notification from Ledger.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to send test notification", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
