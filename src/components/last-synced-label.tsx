"use client";

import { useEffect, useState } from "react";

/**
 * `/accounts` is a Server Component, so `new Date(...).toLocaleString()`
 * called directly there runs on the server (Vercel, UTC) — not in the
 * viewer's browser — which is exactly what produced "8:32 PM" for an
 * actual 4:32 PM EDT sync.
 *
 * This needs a genuine post-mount effect, not just a "use client"
 * component: Next.js still renders a Client Component once on the server
 * to produce the initial HTML, and React's hydration reuses that
 * component instance's initial state rather than re-running its
 * initializer fresh in the browser — confirmed empirically, an
 * SSR-computed `useState(() => ...)` lazy initializer does not
 * re-execute on hydration the way a first client-only mount would. The
 * only point in this component's lifecycle that's guaranteed to run
 * exclusively in the browser, after `window`/`Intl` are the viewer's own,
 * is a `useEffect` that fires post-mount. This is precisely the
 * "synchronizing with a value only available from a browser API"
 * exception React's own effects guide carves out, not a component
 * reacting to its own state — hence the targeted lint override below.
 */
export function LastSyncedLabel({ timestamp }: { timestamp: string | null }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!timestamp) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this IS the browser-only computation; there is no server-side equivalent to synchronize from
    setLabel(new Date(timestamp).toLocaleString());
  }, [timestamp]);

  if (!timestamp) return <>Never synced</>;
  return <>{label ? `Last synced ${label}` : "Last synced…"}</>;
}
