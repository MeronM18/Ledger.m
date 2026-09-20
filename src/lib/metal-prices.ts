import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type Metal = "gold" | "silver";

// GoldAPI.io — a real signed-up provider (replacing the unofficial Yahoo
// Finance futures endpoint this used before), spot price per troy oz.
// Verified against real requests before implementing: auth is the
// x-access-token header (confirmed via a bad-token request returning
// {"error":"Invalid API Key"} with 403, and a missing-header request
// returning {"error":"No API Key provided"} with 403 — GoldAPI's docs
// weren't assumed, both failure shapes were checked directly), and a
// successful response includes a top-level "price" field (USD per troy
// ounce, confirmed via "unit":"troy_ounce" in the real response) among
// others not used here. Free tier is 100 requests/month — comfortably
// covers one fetch/day per metal (~60/month).
const GOLDAPI_URL = (symbol: "XAU" | "XAG") => `https://www.goldapi.io/api/price/${symbol}/USD`;

const METAL_SYMBOLS: Record<Metal, "XAU" | "XAG"> = {
  gold: "XAU",
  silver: "XAG",
};

type GoldApiResponse = {
  price?: number;
  error?: string;
};

export type MetalPriceFetchResult =
  | { metal: Metal; ok: true; price: number }
  | { metal: Metal; ok: false; error: string };

// This is a real, signed-up provider (not an unofficial/scraped source),
// but the fetch is still wrapped defensively — a network hiccup or a
// provider-side outage must never crash the cron job or throw a 500. Every
// failure mode (network error, non-200, non-JSON body, missing/non-numeric
// price) is caught here and turned into a logged error + { ok: false },
// so the caller just keeps whatever price was last cached.
async function fetchSpotPrice(symbol: "XAU" | "XAG"): Promise<{ price: number } | { error: string }> {
  let response: Response;
  try {
    response = await fetch(GOLDAPI_URL(symbol), {
      headers: {
        "x-access-token": env.GOLDAPI_KEY,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error" };
  }

  let json: GoldApiResponse;
  try {
    json = (await response.json()) as GoldApiResponse;
  } catch {
    return { error: `Malformed response (not JSON), HTTP ${response.status}` };
  }

  if (!response.ok) {
    return { error: json.error ?? `HTTP ${response.status}` };
  }

  const price = json.price;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return { error: json.error ?? "Missing price in response" };
  }

  return { price };
}

/**
 * Fetches gold and silver spot prices and upserts each into metal_prices.
 * A failure on one metal doesn't affect the other, and never throws — a
 * failed fetch simply leaves that metal's cached row untouched, so /assets
 * keeps showing the last known price (with staleness surfaced in the UI
 * once it's old enough) rather than losing the value entirely.
 */
export async function refreshMetalPrices(): Promise<MetalPriceFetchResult[]> {
  const admin = createAdminClient();
  const results: MetalPriceFetchResult[] = [];

  for (const metal of Object.keys(METAL_SYMBOLS) as Metal[]) {
    const symbol = METAL_SYMBOLS[metal];
    const fetched = await fetchSpotPrice(symbol);

    if ("error" in fetched) {
      console.error(`Failed to fetch ${metal} (${symbol}) spot price: ${fetched.error}`);
      results.push({ metal, ok: false, error: fetched.error });
      continue;
    }

    const { error: dbError } = await admin.from("metal_prices").upsert(
      {
        metal,
        price_per_troy_oz_usd: fetched.price,
        fetched_at: new Date().toISOString(),
        source: "goldapi_io",
      },
      { onConflict: "metal" }
    );

    if (dbError) {
      console.error(`Failed to upsert ${metal} price`, dbError);
      results.push({ metal, ok: false, error: dbError.message });
      continue;
    }

    results.push({ metal, ok: true, price: fetched.price });
  }

  return results;
}
