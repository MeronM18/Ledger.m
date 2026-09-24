"use client";

import { useRef, useState } from "react";
import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WORDMARK = ["L", "e", "d", "g", "e", "r", ".", "m"];
// ".m" is the champagne accent, as everywhere else.
const ACCENT_FROM = 6;

/**
 * Sign in. The first moment of the same world as the welcome animation:
 * ledger-ruled paper that lights up around the pointer, the wordmark
 * rising out of a champagne rule, and a quiet panel for the magic link.
 * The motion is CSS (globals.css, "Login").
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const stage = useRef<HTMLElement>(null);
  const frame = useRef<number | null>(null);

  // The ruled lines brighten around the pointer. Written straight to CSS
  // variables, once a frame, so moving the mouse never re-renders React.
  function handlePointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || frame.current !== null) return;
    const { clientX, clientY } = e;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      stage.current?.style.setProperty("--lx", `${clientX}px`);
      stage.current?.style.setProperty("--ly", `${clientY}px`);
      stage.current?.setAttribute("data-lit", "");
    });
  }

  // Goes through our own /api/auth/request-magic-link instead of calling
  // supabase.auth.signInWithOtp() directly from the browser — that route
  // checks the email against ALLOWED_EMAIL server-side and never contacts
  // Supabase at all for anyone else, and returns the same message either
  // way so the response itself can't be used to test which emails are
  // allowed.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const res = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setStatus("error");
      setErrorMessage(data.error ?? "Something went wrong. Try again.");
      return;
    }

    setStatus("sent");
  }

  return (
    <main
      ref={stage}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => stage.current?.removeAttribute("data-lit")}
      className="login relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16"
    >
      <div className="login-ruled" aria-hidden />
      <div className="login-ruled login-ruled-lit" aria-hidden />
      <div className="login-glow" aria-hidden />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <h1 className="login-wordmark font-serif" aria-label="Ledger.m">
          {WORDMARK.map((ch, i) => (
            <span key={i} className="login-letter-clip" aria-hidden>
              <span
                className={i >= ACCENT_FROM ? "login-letter text-champagne" : "login-letter"}
                style={{ "--i": i } as React.CSSProperties}
              >
                {ch}
              </span>
            </span>
          ))}
        </h1>

        <div className="login-rule" aria-hidden>
          <span className="login-glint" />
        </div>

        <p className="login-tagline text-sm text-ash-grey">Every account, one quiet ledger.</p>

        <div className="login-panel mt-10 w-full rounded-2xl border border-border/70 bg-card/70 p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)] backdrop-blur-md">
          {status === "sent" ? (
            <div className="flex flex-col items-center gap-4 text-center" aria-live="polite">
              <svg viewBox="0 0 48 48" className="login-check size-12 text-champagne" aria-hidden>
                <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.5" className="login-check-ring" />
                <path d="M15 24.5l6 6 12-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="login-check-mark" />
              </svg>
              <div className="flex flex-col gap-1.5">
                <p className="font-serif text-xl text-bone">Check your inbox</p>
                <p className="text-sm text-muted-foreground">
                  If <span className="text-bone">{email}</span> can sign in, a link is on its way. Open it on this device.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="text-xs text-muted-foreground transition-colors hover:text-champagne"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="login-email" className="text-xs font-medium tracking-[0.08em] text-ash-grey uppercase">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={status === "error" || undefined}
                    required
                    className="h-11 pl-10 text-base md:text-sm"
                  />
                </div>
              </div>
              <Button type="submit" disabled={status === "sending"} className="group h-11 w-full text-sm">
                {status === "sending" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Sending…
                  </>
                ) : (
                  <>
                    Send sign-in link
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                  </>
                )}
              </Button>
              {status === "error" && (
                <p className="text-sm text-oxblood-text" role="alert">
                  {errorMessage}
                </p>
              )}
              <p className="text-center text-xs text-muted-foreground">No password. We email you a one-time link.</p>
            </form>
          )}
        </div>
      </div>

      <p className="login-footer absolute bottom-6 z-10 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        Private · only the owner&apos;s email can sign in
      </p>
    </main>
  );
}
