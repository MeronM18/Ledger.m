import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { syncItemRecurring } from "@/lib/plaid-sync";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  item_id: z.string().uuid().optional(),
});

function hasCronSecret(request: Request): boolean {
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

// Also called internally after every transaction sync (see lib/plaid-sync.ts);
// this route exists for on-demand/manual triggering, same auth pattern as
// /api/plaid/sync.
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

  if (parsed.data.item_id) {
    const result = await syncItemRecurring(parsed.data.item_id);
    return NextResponse.json({ results: [result] });
  }

  const admin = createAdminClient();
  const { data: items } = await admin.from("items").select("id").eq("status", "active");
  const results = [];
  for (const item of items ?? []) {
    results.push(await syncItemRecurring(item.id));
  }
  return NextResponse.json({ results });
}
