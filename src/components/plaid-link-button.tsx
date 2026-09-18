"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { Button } from "@/components/ui/button";

export function PlaidLinkButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldOpenRef = useRef(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token, metadata) => {
      setIsExchanging(true);
      setError(null);

      try {
        const res = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token,
            institution_id: metadata.institution?.institution_id ?? null,
            institution_name: metadata.institution?.name ?? null,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to link account");
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link account");
      } finally {
        setIsExchanging(false);
      }
    },
    [router]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  // usePlaidLink's `open` only works once `ready` flips true for the token
  // we just fetched, so a click that needs a fresh token opens Link here
  // instead of synchronously.
  useEffect(() => {
    if (ready && shouldOpenRef.current) {
      shouldOpenRef.current = false;
      open();
    }
  }, [ready, open]);

  async function handleClick() {
    setError(null);

    if (linkToken) {
      open();
      return;
    }

    setIsFetchingToken(true);
    try {
      const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create link token");
      const data = await res.json();
      shouldOpenRef.current = true;
      setLinkToken(data.link_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link token");
    } finally {
      setIsFetchingToken(false);
    }
  }

  const isBusy = isFetchingToken || isExchanging;

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={isBusy}>
        {isExchanging ? "Connecting..." : isFetchingToken ? "Loading..." : "Connect account"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
