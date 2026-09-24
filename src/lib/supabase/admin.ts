import "server-only";
import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses RLS — only call after requireUser()
 * has passed, or from webhook handlers that verify Plaid's signature instead.
 * Never expose this client or its key to the browser.
 *
 * One client per page render (React's cache()), so the request-scoped
 * loaders keyed on it (loadLedger, loadManualAccounts, ...) are shared by
 * every component on the page instead of each re-reading the database.
 */
export const createAdminClient = cache(() =>
  createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
);
