import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DragHandle } from "@/components/sortable-card-list";
import { cn } from "@/lib/utils";

export type TileChange = {
  // "12%", "28% left".
  text: string;
  // Which way it moved, for the arrow; null for a plain note.
  direction: "up" | "down" | null;
  tone: "good" | "bad" | "quiet";
  // Read out in full: "12% more than August at this point".
  label: string;
};

// With a mouse, a card's grip shows on hover or focus; on a touch screen it's always there.
export const GRIP_ON_HOVER =
  "transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100";

const TONE = { good: "text-moss", bad: "text-oxblood-text", quiet: "text-muted-foreground" } as const;

/**
 * A row of rounded pills, one per day, month or step, each filled from the
 * bottom to its level (0 to 1) in the tile's color. A null level hasn't
 * happened yet and stays an empty track.
 */
export function PillStrip({ levels, color, className }: { levels: (number | null)[]; color: string; className?: string }) {
  return (
    <div className={cn("flex h-9 items-stretch justify-between gap-[2px] sm:h-11 sm:gap-[3px]", className)} aria-hidden>
      {levels.map((level, i) => (
        // Never wider than a pill, so a short series (twelve months) spreads out rather than fattening.
        <span key={i} className="relative max-w-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bone/[0.06]">
          {level !== null && level > 0 && (
            <span className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: `${Math.min(1, level) * 100}%`, background: color }} />
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * One of the Overview's headline figures: what it is, the figure, how it
 * moved, a line of context, and its pills. The whole tile links to the page
 * with the detail.
 */
export function StatTile({
  label,
  shortLabel,
  href,
  value,
  change,
  note,
  shortNote,
  levels,
  color,
}: {
  label: string;
  // Shown instead of the label on a phone, where two tiles share a row.
  shortLabel?: string;
  href: string;
  value: React.ReactNode;
  change?: TileChange | null;
  note: React.ReactNode;
  // Shown instead of the note on a phone.
  shortNote?: React.ReactNode;
  levels: (number | null)[];
  color: string;
}) {
  return (
    <section
      aria-label={label}
      className="relative flex min-h-40 flex-col gap-3 rounded-xl border border-border bg-card px-4 pt-3.5 pb-4 transition-colors hover:border-bone/20 sm:min-h-44 sm:px-5 sm:pt-4 sm:pb-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-muted-foreground">
          {/* The tile is one link; the grip beside it stays its own button. */}
          <Link href={href} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-champagne/60">
            {shortLabel ? (
              <>
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </>
            ) : (
              label
            )}
          </Link>
        </h2>
        {/* At the end of the row, so a grip that's hidden until hover leaves the title in line with the figure. */}
        <DragHandle className={cn("relative z-10 -mr-1.5 ml-0", GRIP_ON_HOVER)} />
      </div>
      <div className="flex flex-col gap-1">
        {/* On a phone the chip always sits under the figure, so the four tiles share one shape. */}
        <p className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
          <span className="font-serif text-[1.625rem] leading-none font-medium tracking-[-0.01em] text-bone sm:text-[2rem]">{value}</span>
          {change && (
            <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums sm:text-sm", TONE[change.tone])}>
              {change.direction === "up" && <ArrowUp className="size-3.5" strokeWidth={2.5} aria-hidden />}
              {change.direction === "down" && <ArrowDown className="size-3.5" strokeWidth={2.5} aria-hidden />}
              <span aria-hidden>{change.text}</span>
              <span className="sr-only">{change.label}</span>
            </span>
          )}
        </p>
        {shortNote ? (
          <>
            <p className="text-xs text-muted-foreground sm:hidden">{shortNote}</p>
            <p className="hidden text-xs text-muted-foreground sm:block">{note}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{note}</p>
        )}
      </div>
      <PillStrip levels={levels} color={color} className="mt-auto" />
    </section>
  );
}
