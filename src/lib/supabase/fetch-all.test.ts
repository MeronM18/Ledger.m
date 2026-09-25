import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type Row = { id: number };
type Page = { data: Row[] | null; error: PostgrestError | null };
type Builder = (from: number, to: number) => Promise<Page>;

const rows = (n: number, start = 0): Row[] => Array.from({ length: n }, (_, i) => ({ id: start + i }));
const page = (data: Row[]): Page => ({ data, error: null });

describe("fetchAllRows", () => {
  it("returns everything across multiple pages, in order, asking for the rest at once", async () => {
    const pages = [rows(1000), rows(1000, 1000), rows(250, 2000)];
    const build = vi.fn<Builder>(async (from) => page(pages[from / 1000] ?? []));
    const { data, error } = await fetchAllRows(build);
    expect(error).toBeNull();
    expect(data).toHaveLength(2250);
    expect(data!.map((r) => r.id)).toEqual(rows(2250).map((r) => r.id));
    // The first page alone, then the next four together.
    expect(build.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
    ]);
  });

  it("stops after one page when it is not full", async () => {
    const build = vi.fn<Builder>(async () => page(rows(10)));
    const { data } = await fetchAllRows(build);
    expect(data).toHaveLength(10);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("handles an exact multiple of the page size (one extra empty page)", async () => {
    const pages = [rows(1000), []];
    const build = vi.fn<Builder>(async (from) => page(pages[from / 1000] ?? []));
    const { data } = await fetchAllRows(build);
    expect(data).toHaveLength(1000);
  });

  it("fails the whole read instead of returning a partial list", async () => {
    const err = { message: "boom" } as PostgrestError;
    const build = vi.fn<Builder>(async (from) =>
      from === 0 ? page(rows(1000)) : { data: null, error: err }
    );
    const result = await fetchAllRows(build);
    expect(result.data).toBeNull();
    expect(result.error).toBe(err);
  });
});
