"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleClick() {
    setIsSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error("Sign out failed", { description: error.message });
      setIsSigningOut(false);
      return;
    }

    // A full page navigation, not router.push — guarantees no stale
    // client-side router cache holds onto authenticated content, and
    // forces the very next request to hit the server with the session
    // already cleared rather than relying on client state alone.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate: sign-out needs a real server round-trip, not the client router
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSigningOut}
      className="flex w-full cursor-pointer items-center gap-2 border-l-2 border-transparent py-2 pr-2 pl-2.5 text-sm font-medium text-ash-grey transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LogOut className="size-4" />
      {isSigningOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
