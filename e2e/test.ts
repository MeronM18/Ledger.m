import { test as base, expect, type Page } from "@playwright/test";
import { MOCK_PORT, sessionCookie } from "./mock-supabase.mjs";

export const MOCK_URL = `http://localhost:${MOCK_PORT}`;

type Fixtures = {
  // Errors the page threw or logged, checked at the end of every test.
  pageErrors: string[];
};

/**
 * Every test starts signed in, on fresh fixture data, and fails if the
 * page throws or logs an error.
 */
export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page, context, request }, use) => {
      await request.post(`${MOCK_URL}/__e2e/reset`);
      const cookie = sessionCookie("localhost");
      await context.addCookies([{ name: cookie.name, value: cookie.value, domain: "localhost", path: "/" }]);

      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        // Third-party noise, not the app: the font CDN and Plaid's script.
        if (/fontshare|plaid\.com|Failed to load resource/i.test(text)) return;
        errors.push(`console: ${text}`);
      });
      await use(errors);
      expect(errors, "the page logged errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** What the app saved to the mock database, newest last. */
export async function mockWrites(page: Page): Promise<{ method: string; table: string; body: unknown }[]> {
  return (await page.request.get(`${MOCK_URL}/__e2e/writes`)).json();
}

/** Pushes the app sent (to the mock ntfy). */
export async function mockPushes(page: Page): Promise<{ title: string; message: string }[]> {
  return (await page.request.get(`${MOCK_URL}/__e2e/pushes`)).json();
}

/** Waits for the welcome animation to clear, so it doesn't sit over what a test clicks. */
export async function afterWelcome(page: Page) {
  await expect(page.locator(".welcome")).toHaveCount(0, { timeout: 8_000 });
}
