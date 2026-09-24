// Environment for running the app against the mock Supabase: placeholders
// for every secret, so nothing real (Plaid, ntfy, GoldAPI) can be reached.
import { TEST_USER } from "./fixtures.mjs";
import { MOCK_PORT } from "./mock-supabase.mjs";

export const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
export const APP_URL = `http://localhost:${APP_PORT}`;

export const testEnv = {
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role",
  ALLOWED_EMAIL: TEST_USER.email,
  PLAID_CLIENT_ID: "e2e",
  PLAID_SECRET: "e2e",
  PLAID_ENV: "sandbox",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  // Pushes go to the mock too, which accepts and ignores them.
  NTFY_SERVER: `http://localhost:${MOCK_PORT}/__e2e/ntfy`,
  NTFY_TOPIC: "e2e",
  CRON_SECRET: "e2e-cron-secret-0123456789",
  GOLDAPI_KEY: "e2e",
  NEXT_TELEMETRY_DISABLED: "1",
};
