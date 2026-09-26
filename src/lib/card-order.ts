// Pure, shared by the server (to render cards in the saved order) and the
// client (to keep a drag's result in sync with a refreshed card list).

// The Overview keeps three orders: its headline tiles ("overview"), the main
// column beneath them, and the column beside them.
export const CARD_ORDER_PAGES = ["accounts", "overview", "overview-main", "overview-rail"] as const;
export type CardOrderPage = (typeof CARD_ORDER_PAGES)[number];

export function cardOrderKey(page: CardOrderPage): string {
  return `card_order:${page}`;
}

/**
 * `items` in the `saved` order. Anything the saved order doesn't know about
 * (an account connected since the last reorder) goes first, in its default
 * order, so something new shows up where it's noticed. With
 * `fresh: "in-place"`, a new item goes after the one it follows by default
 * instead (a card added to the Overview lands where it was designed to sit,
 * not above everything you'd arranged). Saved ids with no matching item (a
 * removed account) are skipped.
 */
export function applyCardOrder<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  saved: readonly string[],
  { fresh: placement = "first" }: { fresh?: "first" | "in-place" } = {}
): T[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const known = new Set(saved);
  const fresh = items.filter((item) => !known.has(keyOf(item)));
  const ordered: T[] = saved.flatMap((key) => {
    const item = byKey.get(key);
    return item === undefined ? [] : [item as T];
  });
  if (placement === "first" || ordered.length === 0) return [...fresh, ...ordered];

  const result: T[] = [...ordered];
  for (const item of fresh) {
    // After the nearest item before it in the default order that's already placed.
    let at = 0;
    for (let i = items.indexOf(item) - 1; i >= 0; i--) {
      const placed = result.indexOf(items[i]);
      if (placed >= 0) {
        at = placed + 1;
        break;
      }
    }
    result.splice(at, 0, item);
  }
  return result;
}
