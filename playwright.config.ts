import { defineConfig, devices } from "@playwright/test";
import { MOCK_PORT } from "./e2e/mock-supabase.mjs";
import { APP_PORT, APP_URL, testEnv } from "./e2e/test-env.mjs";

// Browser tests of the real pages against a mock Supabase (e2e/), so they
// need no database, secrets or network. Locally they drive your installed
// Chrome and a dev server; in CI, Playwright's own Chromium and a
// production build.
const isCI = Boolean(process.env.CI);
const browser = isCI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // One mock database is shared, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    // The welcome animation shows its finished frame and fades in about a
    // second instead of playing out; welcome.spec.ts turns it back on.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...browser } },
    { name: "phone", testMatch: /smoke\.spec\.ts$/, use: { ...devices["Pixel 7"], ...browser } },
  ],
  webServer: [
    {
      command: "node e2e/start-mock-supabase.mjs",
      url: `http://localhost:${MOCK_PORT}/__e2e/writes`,
      reuseExistingServer: !isCI,
    },
    {
      command: isCI ? `npx next build && npx next start -p ${APP_PORT}` : `npx next dev -p ${APP_PORT}`,
      url: `${APP_URL}/login`,
      env: testEnv,
      timeout: 300_000,
      reuseExistingServer: !isCI,
    },
  ],
});
