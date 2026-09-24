import "server-only";
import { z } from "zod";
import { cardOrderKey, type CardOrderPage } from "@/lib/card-order";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const orderSchema = z.array(z.string());

/**
 * The saved card order for a page, or [] when there's none. Never fails the
 * page: if the preference can't be read, the cards just keep their default
 * order.
 */
export async function loadCardOrder(admin: AdminClient, page: CardOrderPage): Promise<string[]> {
  const { data, error } = await admin.from("ui_preferences").select("value").eq("key", cardOrderKey(page)).maybeSingle();
  if (error) {
    console.error("Failed to load card order", error);
    return [];
  }
  const parsed = orderSchema.safeParse(data?.value);
  return parsed.success ? parsed.data : [];
}
