import type { PostgrestError } from "@supabase/supabase-js";

// PostgREST (what Supabase queries go through) silently caps a single
// response at 1,000 rows by default — no error, just a truncated list — so
// any read that needs "every row" (spending totals, the transactions
// table) must page through with .range() instead of a bare .select().
const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: PostgrestError | null };

/**
 * Reads every row a query matches, PAGE_SIZE at a time. `buildQuery` gets an
 * inclusive [from, to] range and must return the query with `.range(from,
 * to)` applied. The query MUST have a deterministic order (a unique
 * tiebreaker like `id`), otherwise rows can repeat or vanish between pages.
 *
 * Any page error fails the whole read (data: null) rather than returning a
 * partial list, so callers' existing error states still fire instead of
 * showing quietly incomplete numbers.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<PageResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return { data: rows, error: null };
}
