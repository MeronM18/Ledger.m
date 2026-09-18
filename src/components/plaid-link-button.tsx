"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { Button } from "@/components/ui/button";

export function PlaidLinkButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plaid/create-link-token", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to create link token");
        return res.json();
      })
      .then((data) => setLinkToken(data.link_token))
      .catch((err) => setError(err.message));
  }, []);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token, metadata) => {
      setIsLoading(true);
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
        setIsLoading(false);
      }
    },
    [router]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => open()} disabled={!ready || isLoading}>
        {isLoading ? "Connecting..." : "Connect account"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
