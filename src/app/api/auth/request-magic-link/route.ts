import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ email: z.string().email() });

// Always the same response, regardless of whether the email matched
// ALLOWED_EMAIL or Supabase's send itself failed — this is a single-user
// app, so confirming "that email is allowed" or "that email exists" to
// whoever's typing is pure information leakage with no upside. A fresh
// NextResponse per call — a Response body can only be read once, so a
// single shared instance breaks on the second request.
function genericResponse() {
  return NextResponse.json({
    message: "If that address has access, a sign-in link is on its way.",
  });
}

/**
 * Gates signInWithOtp behind the ALLOWED_EMAIL allowlist server-side, before
 * Supabase is ever contacted. The login page used to call
 * supabase.auth.signInWithOtp() directly from the browser with the public
 * anon key — which meant literally any email typed into the form reached
 * Supabase's real OTP endpoint, created a real auth user, and (for a
 * deliverable address) sent a real magic-link email. This app has exactly
 * one legitimate user; nobody else should ever be able to trigger that.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const email = parsed.data.email.trim();
  if (email.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
    return genericResponse();
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${new URL(request.url).origin}/auth/callback`,
    },
  });

  if (error) {
    console.error("signInWithOtp failed for the allowed email", error);
  }

  return genericResponse();
}
