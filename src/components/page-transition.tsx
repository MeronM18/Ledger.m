"use client";

import { usePathname } from "next/navigation";

/**
 * A brief crossfade on route change — opacity only, no slide (a slide reads
 * as "app-like consumer product," not "private ledger"). Keying the wrapper
 * by pathname forces a fresh DOM node per route, which re-triggers the CSS
 * animation on every navigation without any manual state/useEffect.
 *
 * Considered React's <ViewTransition> (native in this Next.js version) —
 * went with plain CSS instead since it works in every browser rather than
 * only recent Chromium/Safari/Firefox, and the effect this brief asks for
 * (a restrained fade, nothing directional) doesn't need what
 * <ViewTransition> is actually for: shared-element morphing and
 * directional nav. That would be more moving parts for the same result.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
