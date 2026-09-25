"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** `collapsed`: in the sidebar's icon rail, the label fades and shows on hover instead. */
export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleClick() {
    setIsSigningOut(true);
    // Loaded on click: the Supabase browser client is big, and only signing out needs it.
    const { createClient } = await import("@/lib/supabase/client");
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
      title={collapsed ? "Sign out" : undefined}
      className="flex w-full cursor-pointer items-center gap-3 overflow-hidden border-l-2 border-transparent py-2 pr-2 pl-2.5 text-sm font-medium whitespace-nowrap text-ash-grey transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "truncate transition-opacity",
          collapsed ? "opacity-0 duration-100" : "opacity-100 delay-100 duration-300"
        )}
      >
        {isSigningOut ? "Signing out..." : "Sign out"}
      </span>
    </button>
  );
}
