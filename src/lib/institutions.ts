import "server-only";
import type { Ledger } from "@/lib/spending-data";
import type { createAdminClient } from "@/lib/supabase/admin";

/** The bank each account is at, by account id (a manual one's as `manual:<id>`), for its mark. */
export async function loadInstitutions(admin: ReturnType<typeof createAdminClient>, ledger: Ledger): Promise<Record<string, string>> {
  const { data } = await admin.from("accounts").select("id, item:items(institution_name)");
  const institutions: Record<string, string> = {};
  for (const a of (data ?? []) as unknown as { id: string; item: { institution_name: string | null } | null }[]) {
    if (a.item?.institution_name) institutions[a.id] = a.item.institution_name;
  }
  for (const m of ledger.manualAccounts) institutions[`manual:${m.id}`] = m.institution_name;
  return institutions;
}
