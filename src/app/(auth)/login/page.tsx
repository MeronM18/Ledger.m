"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

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
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus("error");
      setErrorMessage(data.error ?? "Something went wrong");
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="animate-entrance">
          <CardTitle className="font-serif text-2xl font-bold tracking-tight text-champagne">
            Ledger.m
          </CardTitle>
          <CardDescription>Sign in with a magic link sent to your email.</CardDescription>
        </CardHeader>
        <CardContent className="animate-entrance [animation-delay:130ms]">
          {status === "sent" ? (
            <p className="text-sm text-muted-foreground">
              Check your inbox for a sign-in link.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Sending..." : "Send magic link"}
              </Button>
              {status === "error" && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
