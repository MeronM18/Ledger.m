"use client";

import { useEffect } from "react";
import "./globals.css";

// The last-resort boundary — fires only for errors in the root layout
// itself (vs. (dashboard)/error.tsx and (auth)/error.tsx, which cover
// everything below it). Next.js requires this to define its own <html>/
// <body> since it fully replaces the root layout when it renders, so it's
// kept deliberately minimal — no next/font, no shared UI components — the
// fewer moving parts here, the less that can go wrong in the one place
// with no further fallback underneath it.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground antialiased">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-oxblood/40 bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-bone">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Ledger.m hit an unexpected error loading.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-bone transition-colors hover:bg-muted"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
