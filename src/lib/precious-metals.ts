// Pure, dependency-free — value math and the price-staleness check kept
// separate from data-fetching so they can be exercised directly.

export const TROY_OZ_IN_GRAMS = 31.1034768;

export type WeightUnit = "oz" | "g";

export function toTroyOunces(weight: number, unit: WeightUnit): number {
  return unit === "oz" ? weight : weight / TROY_OZ_IN_GRAMS;
}

/**
 * value = weight_in_troy_oz × purity × cached_price_per_troy_oz.
 * pricePerTroyOz is null when no price has ever been successfully fetched
 * for this metal (e.g. a brand-new deployment before the first cron run) —
 * the holding still exists, it just can't be valued yet.
 */
export function holdingValue(
  weight: number,
  unit: WeightUnit,
  purity: number,
  pricePerTroyOz: number | null
): number | null {
  if (pricePerTroyOz === null) return null;
  return toTroyOunces(weight, unit) * purity * pricePerTroyOz;
}

export type Metal = "gold" | "silver";

export type HoldingLike = {
  metal: Metal;
  weight: number;
  weight_unit: WeightUnit;
  purity: number;
};

export type MetalPriceLike = {
  metal: Metal;
  price_per_troy_oz_usd: number;
};

/**
 * Sums holdingValue() across every holding, feeding computeNetWorth()'s
 * preciousMetalsValue parameter. Pulled out as its own function rather than
 * left as an inline reduce in each page, specifically because that's what
 * drifted before: the Assets page computed this sum and passed it to
 * computeNetWorth(), /overview never computed it at all and silently
 * defaulted to 0. One function, called from both places, closes that gap
 * for good — a future caller can't "forget" the reduce logic, only forget
 * to call the function (which is a much smaller, more obvious mistake to
 * catch).
 */
export function totalPreciousMetalsValue(holdings: HoldingLike[], prices: MetalPriceLike[]): number {
  const priceByMetal = new Map(prices.map((p) => [p.metal, p.price_per_troy_oz_usd]));
  return holdings.reduce((sum, h) => {
    const value = holdingValue(h.weight, h.weight_unit, h.purity, priceByMetal.get(h.metal) ?? null);
    return sum + (value ?? 0);
  }, 0);
}

// A cached price older than this is shown with a visible "as of [date]"
// staleness indicator rather than silently presented as current — the feed
// not updating (rate limited, endpoint shape change, etc.) should be
// obvious, not hidden behind a normal-looking number.
const STALE_AFTER_HOURS = 36;

export function isPriceStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs > STALE_AFTER_HOURS * 60 * 60 * 1000;
}
