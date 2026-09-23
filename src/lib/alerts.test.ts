import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "@/lib/alerts-logic";

const sendNotification = vi.fn<(subtitle: string, body: string) => Promise<void>>();
vi.mock("@/lib/notify", () => ({ sendNotification: (s: string, b: string) => sendNotification(s, b) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { dispatchAlerts } from "@/lib/alerts";

// A tiny in-memory stand-in for the alert_events table, covering exactly the
// calls dispatchAlerts makes: upsert(ignoreDuplicates).select(), delete().eq().
function fakeAdmin(options: { failInsertFor?: string } = {}) {
  const rows = new Map<string, { id: string; dedupe_key: string }>();
  let nextId = 1;

  const admin = {
    from: () => ({
      upsert: (row: { dedupe_key: string }) => ({
        select: async () => {
          if (row.dedupe_key === options.failInsertFor) return { data: null, error: { message: "db down" } };
          if (rows.has(row.dedupe_key)) return { data: [], error: null };
          const created = { id: `id${nextId++}`, dedupe_key: row.dedupe_key };
          rows.set(row.dedupe_key, created);
          return { data: [{ id: created.id }], error: null };
        },
      }),
      delete: () => ({
        eq: async (_col: string, id: string) => {
          for (const [k, v] of rows) if (v.id === id) rows.delete(k);
          return { error: null };
        },
      }),
    }),
  };

  return { admin: admin as never, rows };
}

const alert = (key: string): Alert => ({ key, kind: "renewal", title: `Title ${key}`, body: `Body ${key}` });

beforeEach(() => {
  sendNotification.mockReset();
  sendNotification.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("dispatchAlerts", () => {
  it("pushes a new alert once and never repeats it", async () => {
    const { admin } = fakeAdmin();
    const first = await dispatchAlerts(admin, [alert("a")]);
    const second = await dispatchAlerts(admin, [alert("a")]);
    expect(first).toMatchObject({ sent: 1, alreadySent: 0 });
    expect(second).toMatchObject({ sent: 0, alreadySent: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith("Title a", "Body a");
  });

  it("dedupes within one run", async () => {
    const { admin } = fakeAdmin();
    const r = await dispatchAlerts(admin, [alert("a"), alert("a")]);
    expect(r).toMatchObject({ sent: 1, alreadySent: 1 });
  });

  it("removes the record when the push fails so the next run retries", async () => {
    const { admin, rows } = fakeAdmin();
    sendNotification.mockRejectedValueOnce(new Error("ntfy down"));
    const failed = await dispatchAlerts(admin, [alert("a")]);
    expect(failed).toMatchObject({ sent: 0, failed: 1 });
    expect(rows.size).toBe(0);

    const retried = await dispatchAlerts(admin, [alert("a")]);
    expect(retried).toMatchObject({ sent: 1, failed: 0 });
  });

  it("counts a database failure and keeps going with the other alerts", async () => {
    const { admin } = fakeAdmin({ failInsertFor: "bad" });
    const r = await dispatchAlerts(admin, [alert("bad"), alert("good")]);
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(sendNotification).toHaveBeenCalledWith("Title good", "Body good");
  });

  it("caps pushes per run, records the rest, and sends one summary", async () => {
    const { admin, rows } = fakeAdmin();
    const many = Array.from({ length: 8 }, (_, i) => alert(`k${i}`));
    const r = await dispatchAlerts(admin, many);
    expect(r).toMatchObject({ sent: 5, recordedOnly: 3 });
    expect(rows.size).toBe(8); // all recorded for the in-app list
    expect(sendNotification).toHaveBeenCalledTimes(6); // 5 alerts + 1 summary
    expect(sendNotification).toHaveBeenLastCalledWith("3 more alerts", expect.any(String));

    // The recorded-only ones are not re-pushed later.
    sendNotification.mockClear();
    await dispatchAlerts(admin, many);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
