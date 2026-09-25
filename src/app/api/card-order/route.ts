import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { CARD_ORDER_PAGES, cardOrderKey } from "@/lib/card-order";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  page: z.enum(CARD_ORDER_PAGES),
  order: z.array(z.string().min(1).max(100)).max(200),
});

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ui_preferences")
    .upsert({ key: cardOrderKey(parsed.data.page), value: parsed.data.order }, { onConflict: "key" });
  if (error) {
    console.error("Failed to save card order", error);
    return NextResponse.json({ error: "Failed to save the order" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Back to the default order on every page. */
export async function DELETE() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { error } = await createAdminClient()
    .from("ui_preferences")
    .delete()
    .in("key", CARD_ORDER_PAGES.map(cardOrderKey));
  if (error) {
    console.error("Failed to reset card order", error);
    return NextResponse.json({ error: "Failed to reset the layout" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
