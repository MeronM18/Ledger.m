import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendNotification } from "@/lib/notify";

// Sends a test push. Works signed in (Settings' "Send a test alert"), or
// with CRON_SECRET so it can be curl'd directly to confirm ntfy delivery.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    const auth = await requireApiUser();
    if ("error" in auth) return auth.error;
  }

  try {
    await sendNotification("Test notification", "This is a test notification from Ledger.m.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to send test notification", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
