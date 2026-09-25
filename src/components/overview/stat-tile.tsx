import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DragHandle } from "@/components/sortable-card-list";
import { cn } from "@/lib/utils";

export type TileChange = {
  // "12%", "Over".
  text: string;
  // Which way it moved, for the arrow; null for a plain note.
  direction: "up" | "down" | null;
  tone: "good" | "bad" | "quiet";
  // Read out in full: "12% more than August at this point".
  label: string;
};

// A card's grip sits at the middle of its top edge, turned sideways, out of
// the header row so titles and links keep their places. With a mouse it
// shows on hover or focus; on a touch screen it's always there.
export const CARD_GRIP =
  "absolute top-0.5 left-1/2 z-10 ml-0 -translate-x-1/2 [&>svg]:rotate-90 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100";

const CHIP = {
  good: "bg-moss/12 text-moss ring-moss/25",
  bad: "bg-oxblood/15 text-oxblood-text ring-oxblood/30",
  quiet: "bg-bone/[0.06] text-muted-foreground ring-bone/10",
} as const;

/** How a figure moved, as a small rounded chip: an arrow and a percentage, or a word. */
export function ChangeChip({ change, className }: { change: TileChange; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset", CHIP[change.tone], className)}>
      {change.direction === "up" && <ArrowUp className="size-3" strokeWidth={2.5} aria-hidden />}
      {change.direction === "down" && <ArrowDown className="size-3" strokeWidth={2.5} aria-hidden />}
      <span aria-hidden>{change.text}</span>
      <span className="sr-only">{change.label}</span>
    </span>
  );
}

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

/**
 * One of the Overview's headline figures: what it is, the figure, and a
 * footer with what it's measured against and how it moved. The whole tile
 * links to the page with the detail.
 */
export function StatTile({
  label,
  shortLabel,
  href,
  value,
  change,
  note,
  shortNote,
}: {
  label: string;
  // Shown instead of the label on a phone, where tiles share a row.
  shortLabel?: string;
  href: string;
  value: React.ReactNode;
  change?: TileChange | null;
  note: React.ReactNode;
  // Shown instead of the note on a phone.
  shortNote?: React.ReactNode;
}) {
  return (
    // Sized by its own width, not the screen's: three tiles share a row beside the budget column.
    <section aria-label={label} className="@container relative flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-bone/20">
      <DragHandle className={CARD_GRIP} />
      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-4 @[15rem]:px-5 @[15rem]:pt-4 @[15rem]:pb-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm text-muted-foreground">
            {/* The tile is one link; the grip beside it stays its own button. */}
            <Link href={href} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-champagne/60">
              {shortLabel ? (
                <>
                  <span className="@[15rem]:hidden">{shortLabel}</span>
                  <span className="hidden @[15rem]:inline">{label}</span>
                </>
              ) : (
                label
              )}
            </Link>
          </h2>
        </div>
        <span className="font-serif text-[1.5rem] leading-none font-medium tracking-[-0.01em] text-bone @[16rem]:text-[2rem]">{value}</span>
      </div>
      {/* What it's measured against, set apart below the figure. */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 @[15rem]:px-5">
        {shortNote ? (
          <>
            <p className="min-w-0 truncate text-xs text-muted-foreground @[18rem]:hidden">{shortNote}</p>
            <p className="hidden min-w-0 truncate text-xs text-muted-foreground @[18rem]:block">{note}</p>
          </>
        ) : (
          <p className="min-w-0 truncate text-xs text-muted-foreground">{note}</p>
        )}
        {change && <ChangeChip change={change} />}
      </div>
    </section>
  );
}
