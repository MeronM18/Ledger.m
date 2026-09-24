// Pure, shared by the server (to render cards in the saved order) and the
// client (to keep a drag's result in sync with a refreshed card list).

export const CARD_ORDER_PAGES = ["accounts"] as const;
export type CardOrderPage = (typeof CARD_ORDER_PAGES)[number];

export function cardOrderKey(page: CardOrderPage): string {
  return `card_order:${page}`;
}

/**
 * `items` in the `saved` order. Anything the saved order doesn't know about
 * (an account connected since the last reorder) goes first, in its default
 * order, so something new shows up where it's noticed. Saved ids with no
 * matching item (a removed account) are skipped.
 */
export function applyCardOrder<T>(items: readonly T[], keyOf: (item: T) => string, saved: readonly string[]): T[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const known = new Set(saved);
  const fresh = items.filter((item) => !known.has(keyOf(item)));
  const ordered = saved.flatMap((key) => {
    const item = byKey.get(key);
    return item === undefined ? [] : [item];
  });
  return [...fresh, ...ordered];
}
