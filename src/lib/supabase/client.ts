import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client, used for auth only (magic link sign-in/out).
 * Table access never happens from the client — see lib/supabase/admin.ts.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
