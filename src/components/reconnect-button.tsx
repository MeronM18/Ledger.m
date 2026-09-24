"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccess } from "react-plaid-link";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Reopens Plaid Link for a bank that needs signing in again (Plaid's update
 * mode). The connection, its accounts and its history all stay; once the
 * sign-in goes through, it's marked connected and synced straight away.
 */
export function ReconnectButton({ itemId, institutionName }: { itemId: string; institutionName: string }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"token" | "syncing" | null>(null);
  const shouldOpen = useRef(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async () => {
    setBusy("syncing");
    try {
      const res = await fetch("/api/plaid/reconnected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't finish reconnecting");
      if (data.result?.ok === false) {
        toast.warning(`${institutionName} is reconnected`, {
          description: `The catch-up sync didn't finish (${data.result.error}). It will retry on the next sync.`,
        });
      } else {
        toast.success(`${institutionName} is reconnected`, { description: "It's syncing again." });
      }
      router.refresh();
    } catch (err) {
      toast.error("Reconnect didn't finish", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  }, [itemId, institutionName, router]);

  const onExit = useCallback<PlaidLinkOnExit>(
    (error) => {
      // A token only works once; start fresh next time.
      setLinkToken(null);
      if (error) toast.error(`Couldn't sign in to ${institutionName}`, { description: error.display_message ?? error.error_message });
    },
    [institutionName]
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  useEffect(() => {
    if (ready && shouldOpen.current) {
      shouldOpen.current = false;
      open();
    }
  }, [ready, open]);

  async function handleClick() {
    setBusy("token");
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the sign-in");
      shouldOpen.current = true;
      setLinkToken(data.link_token);
    } catch (err) {
      toast.error("Couldn't start the sign-in", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={busy !== null}>
      <KeyRound className="size-3.5" />
      {busy === "syncing" ? "Syncing..." : busy === "token" ? "Opening..." : "Reconnect"}
    </Button>
  );
}
