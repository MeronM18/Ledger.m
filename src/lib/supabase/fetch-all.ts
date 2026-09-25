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
  const page = (i: number) => buildQuery(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);

  // The first page says whether there's more. After that, pages are asked
  // for a few at once rather than one after another, so a long history
  // costs a round trip or two instead of one per thousand rows.
  const first = await page(0);
  if (first.error) return { data: null, error: first.error };
  const rows: T[] = [...(first.data ?? [])];
  if (!first.data || first.data.length < PAGE_SIZE) return { data: rows, error: null };

  for (let next = 1; ; next += PARALLEL_PAGES) {
    const results = await Promise.all(Array.from({ length: PARALLEL_PAGES }, (_, k) => page(next + k)));
    for (const r of results) {
      if (r.error) return { data: null, error: r.error };
      rows.push(...(r.data ?? []));
      if (!r.data || r.data.length < PAGE_SIZE) return { data: rows, error: null };
    }
  }
}

// Pages read at once after the first. A page past the end just comes back empty.
const PARALLEL_PAGES = 4;
