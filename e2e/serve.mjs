// Runs the app against the mock Supabase, for local previews:
//   node e2e/serve.mjs     then open http://localhost:54321/__e2e/login
import { spawn } from "node:child_process";
import { startMockSupabase } from "./mock-supabase.mjs";
import { APP_PORT, testEnv } from "./test-env.mjs";

await startMockSupabase();
const mode = process.argv.includes("--prod") ? "start" : "dev";
const child = spawn("npx", ["next", mode, "-p", String(APP_PORT)], {
  stdio: "inherit",
  env: { ...process.env, ...testEnv },
});
child.on("exit", (code) => process.exit(code ?? 0));
