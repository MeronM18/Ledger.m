import { cn } from "@/lib/utils";

// A card's grip sits at the middle of its top edge, turned sideways, out of
// the header row so titles and links keep their places. With a mouse it
// shows on hover or focus; on a touch screen it's always there.
export const CARD_GRIP =
  "absolute top-0.5 left-1/2 z-10 ml-0 -translate-x-1/2 [&>svg]:rotate-90 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100";

/**
 * A row of rounded pills, one per step, each filled from the bottom to its
 * level (0 to 1) in the card's color. A null level stays an empty track.
 */
export function PillStrip({ levels, color, className }: { levels: (number | null)[]; color: string; className?: string }) {
  return (
    <div className={cn("flex h-12 items-stretch justify-between gap-[3px]", className)} aria-hidden>
      {levels.map((level, i) => (
        // Never wider than a pill, so a short series spreads out rather than fattening.
        <span key={i} className="relative max-w-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bone/[0.06]">
          {level !== null && level > 0 && (
            <span className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: `${Math.min(1, level) * 100}%`, background: color }} />
          )}
        </span>
      ))}
    </div>
  );
}
