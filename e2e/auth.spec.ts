import { test as base, expect } from "@playwright/test";

// Deliberately the plain Playwright test: no session cookie.
base("a visitor without a session is sent to the login page", async ({ page }) => {
  await page.goto("/income");
  await expect(page).toHaveURL(/\/login$/);
});

base("the API refuses a request without a session", async ({ request }) => {
  const res = await request.get("/api/export");
  expect(res.status()).toBe(401);
});
