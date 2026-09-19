import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Metal = "gold" | "silver";

// Unofficial, undocumented endpoint — verified against a real request
// before building this (see PR description): returns
// { chart: { result: [{ meta: { regularMarketPrice, ... } }] } } on
// success, or { chart: { result: null, error: { code, description } } }
// for a bad symbol. The v7 quote endpoint (the other commonly-remembered
// option) now requires an auth crumb and returned {"error":{"code":
// "Unauthorized", ...}} on a plain request — confirmed not usable without
// extra machinery, so this is the only viable unauthenticated option.
const YAHOO_CHART_URL = (symbol: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;

const METAL_TICKERS: Record<Metal, string> = {
  gold: "GC=F",
  silver: "SI=F",
};

type YahooChartResponse = {
  chart: {
    result: [{ meta?: { regularMarketPrice?: number } }] | null;
    error: { code: string; description: string } | null;
  };
};

export type MetalPriceFetchResult =
  | { metal: Metal; ok: true; price: number }
  | { metal: Metal; ok: false; error: string };

// Futures price, not true spot, and this endpoint is unofficial — it can
// change shape or start rate-limiting without notice. Every failure mode
// (network error, non-200, non-JSON body, missing/non-numeric price) is
// caught here and turned into a logged error + { ok: false }, never a
// thrown exception, so one bad response can't crash the cron run or
// surface as a 500 — the caller just keeps whatever price was last cached.
async function fetchFuturesPrice(symbol: string): Promise<{ price: number } | { error: string }> {
  let response: Response;
  try {
    response = await fetch(YAHOO_CHART_URL(symbol), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error" };
  }

  if (!response.ok) {
    return { error: `HTTP ${response.status}` };
  }

  let json: YahooChartResponse;
  try {
    json = (await response.json()) as YahooChartResponse;
  } catch {
    return { error: "Malformed response (not JSON)" };
  }

  const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return { error: json.chart?.error?.description ?? "Missing regularMarketPrice in response" };
  }

  return { price };
}

/**
 * Fetches gold and silver futures prices and upserts each into
 * metal_prices. A failure on one metal doesn't affect the other, and never
 * throws — a failed fetch simply leaves that metal's cached row untouched,
 * so /assets keeps showing the last known price (with staleness surfaced
 * in the UI once it's old enough) rather than losing the value entirely.
 */
export async function refreshMetalPrices(): Promise<MetalPriceFetchResult[]> {
  const admin = createAdminClient();
  const results: MetalPriceFetchResult[] = [];

  for (const metal of Object.keys(METAL_TICKERS) as Metal[]) {
    const symbol = METAL_TICKERS[metal];
    const fetched = await fetchFuturesPrice(symbol);

    if ("error" in fetched) {
      console.error(`Failed to fetch ${metal} (${symbol}) futures price: ${fetched.error}`);
      results.push({ metal, ok: false, error: fetched.error });
      continue;
    }

    const { error: dbError } = await admin.from("metal_prices").upsert(
      {
        metal,
        price_per_troy_oz_usd: fetched.price,
        fetched_at: new Date().toISOString(),
        source: "yahoo_finance_futures",
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
