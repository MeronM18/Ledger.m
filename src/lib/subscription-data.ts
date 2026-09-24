import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Keeps each .in() list comfortably inside PostgREST's URL length limits.
const CHUNK_SIZE = 150;

/**
 * The amount of each stream's earliest charge, keyed by stream id, from the
 * transactions a stream is made of. Used to spot a trial that converted (a
 * token first charge, then the real price). Also the merchant logo the bank
 * sent with its latest charge, for the row's avatar. A stream whose
 * transactions aren't available simply has no entry.
 */
export async function loadFirstChargeAmounts(
  admin: AdminClient,
  streams: { id: string; transaction_ids: string[] | null }[]
): Promise<{ amounts: Map<string, number>; logos: Map<string, string>; error: boolean }> {
  const allIds = Array.from(new Set(streams.flatMap((s) => s.transaction_ids ?? [])));
  type Charge = { amount: number; date: string; logo: string | null };
  const byPlaidId = new Map<string, Charge>();
  let error = false;

  for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
    const { data, error: chunkError } = await admin
      .from("transactions")
      .select("plaid_transaction_id, amount, date, logo_url")
      .in("plaid_transaction_id", allIds.slice(i, i + CHUNK_SIZE));
    if (chunkError) {
      console.error("Failed to load stream transactions for trial detection", chunkError);
      error = true;
      continue;
    }
    for (const t of data ?? []) byPlaidId.set(t.plaid_transaction_id, { amount: Number(t.amount), date: t.date, logo: t.logo_url ?? null });
  }

  const amounts = new Map<string, number>();
  const logos = new Map<string, string>();
  for (const s of streams) {
    const txs = (s.transaction_ids ?? []).map((id) => byPlaidId.get(id)).filter((t): t is Charge => Boolean(t));
    if (txs.length === 0) continue;
    const first = txs.reduce((min, t) => (t.date < min.date ? t : min), txs[0]);
    amounts.set(s.id, first.amount);
    const logo = [...txs].sort((a, b) => b.date.localeCompare(a.date)).find((t) => t.logo)?.logo;
    if (logo) logos.set(s.id, logo);
  }

  return { amounts, logos, error };
}
