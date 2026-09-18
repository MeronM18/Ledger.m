import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

async function getAllowedUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== env.ALLOWED_EMAIL) {
    return null;
  }

  return user;
}

/**
 * For Server Components / layouts. Redirects to /login when there is no
 * session or the session's email isn't the single allowed user.
 */
export async function requireUser(): Promise<User> {
  const user = await getAllowedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * For Route Handlers. Returns a 401 NextResponse instead of redirecting.
 * Usage: const auth = await requireApiUser(); if ("error" in auth) return auth.error;
 */
export async function requireApiUser(): Promise<{ user: User } | { error: NextResponse }> {
  const user = await getAllowedUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user };
}
