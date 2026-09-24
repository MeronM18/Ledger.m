// Runs the mock Supabase on its own (mock-supabase.mjs has the details).
import { MOCK_PORT, startMockSupabase } from "./mock-supabase.mjs";

await startMockSupabase();
console.log(`Mock Supabase listening on http://localhost:${MOCK_PORT}`);
