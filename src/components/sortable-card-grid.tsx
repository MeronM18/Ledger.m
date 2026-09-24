"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";
import { cn } from "cn";
import { useCardOrder } from "@/components/sortable-card-list";
import { applyCardOrder, type CardOrderPage } from "@/lib/card-order";

export type GridCard = {
  id: string;
  // Read out by screen readers while moving the card.
  label: string;
  // "full" spans both columns on wider screens; "half" takes one.
  span: "full" | "half";
  node: React.ReactNode;
};

// Same settle curve as the list on Accounts: quick to start, soft to land.
const SETTLE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Cards don't slide by computed offsets (which can't work when a wide card
// trades places with a narrow one); the grid itself is reordered as the
// card is dragged, and each card animates from where it was to where the
// new layout puts it.
const noDisplacement = () => null;

// The pointer decides where a card goes (steady in a grid of mixed sizes);
// when it's between cards, the nearest one does.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

// How far the pointer has to travel after one trade of places before the next.
const MOVE_BEFORE_NEXT_SWAP = 24;

const dropAnimation: DropAnimation = {
  duration: 260,
  easing: SETTLE,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
};

/** The grip: a short bar centered on the card's top edge, inside its top padding. */
function Grip({ label, props, lifted = false }: { label: string; props?: React.HTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }; lifted?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`Move ${label}`}
      {...props}
      className={cn(
        "absolute top-0 left-1/2 z-10 flex h-4 w-12 -translate-x-1/2 touch-none items-center justify-center rounded-b-md text-muted-foreground/40 transition-colors",
        "cursor-grab group-hover/tile:text-muted-foreground hover:!text-champagne focus-visible:!text-champagne focus-visible:outline-none active:cursor-grabbing",
        lifted && "cursor-grabbing !text-champagne"
      )}
    >
      <GripHorizontal className="size-4" aria-hidden />
    </button>
  );
}

function Tile({ card, enabled }: { card: GridCard; enabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !enabled,
    transition: { duration: 320, easing: SETTLE },
    // Animate every move, including the live reorders while dragging.
    animateLayoutChanges: () => true,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/tile relative min-w-0", card.span === "full" && "md:col-span-2")}
    >
      {/* While it's being dragged, its place in the grid shows as an outline.
          Cards fill their tile, so two side by side stay the same height. */}
      <div className={cn("h-full transition-opacity duration-150 [&>*]:h-full", isDragging && "opacity-0")}>{card.node}</div>
      {isDragging && (
        <div aria-hidden className="absolute inset-0 rounded-xl border border-dashed border-champagne/40 bg-champagne/[0.03]" />
      )}
      {enabled && !isDragging && (
        <Grip label={card.label} props={{ ...attributes, ...listeners, ref: setActivatorNodeRef }} />
      )}
    </div>
  );
}

/**
 * A two-column grid of cards (one column on phones) the user can rearrange
 * by the grip on each card's top edge, with the mouse, a finger, or the
 * keyboard (focus the grip, Space to lift, arrows to move, Space to drop).
 * The card being moved lifts and follows the pointer while the rest make
 * room for it, so what you see mid-drag is the layout you'll get. The order
 * is saved right away, like the cards on Accounts.
 */
export function SortableCardGrid({ page, cards }: { page: CardOrderPage; cards: GridCard[] }) {
  const { ordered, ids, setOrder, save } = useCardOrder(page, cards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const startOrder = useRef<string[]>([]);
  // Where the pointer was at the last trade of places. After a trade the
  // grid reflows under a pointer that hasn't moved (a wide card moving down
  // pulls the ones after it up under the pointer), which would set off the
  // next trade and the next; so another trade waits until the pointer
  // itself has moved on.
  const lastSwap = useRef<{ id: UniqueIdentifier; at: number; x: number; y: number } | null>(null);
  const labelOf = (id: UniqueIdentifier) => cards.find((c) => c.id === id)?.label ?? "Card";
  const active = ordered.find((c) => c.id === activeId) ?? null;

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click on the grip isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart({ active }: DragStartEvent) {
    startOrder.current = ids;
    lastSwap.current = null;
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over, delta }: DragOverEvent) {
    if (!over || over.id === active.id) return;
    const now = performance.now();
    const last = lastSwap.current;
    if (last) {
      const moved = Math.hypot(delta.x - last.x, delta.y - last.y);
      if (moved < MOVE_BEFORE_NEXT_SWAP || (last.id === over.id && now - last.at < 350)) return;
    }
    lastSwap.current = { id: over.id, at: now, x: delta.x, y: delta.y };
    setOrder((saved) => {
      const current = applyCardOrder(cards, (c) => c.id, saved).map((c) => c.id);
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  }

  function handleDragEnd() {
    setActiveId(null);
    const before = startOrder.current;
    if (ids.some((id, i) => id !== before[i])) void save(ids, before);
  }

  function handleDragCancel() {
    setActiveId(null);
    setOrder(startOrder.current);
  }

  const position = (id: UniqueIdentifier) => `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, ${position(active.id)}.`,
    onDragOver: ({ active }) => `${labelOf(active.id)} moved to ${position(active.id)}.`,
    onDragEnd: ({ active }) => `${labelOf(active.id)} dropped at ${position(active.id)}.`,
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled. It's back where it started.`,
  };

  return (
    <DndContext
      id={`card-grid-${page}`}
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Re-measure as the grid reflows, so the next move is judged against
      // where cards are now.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "To move this card, press Space, then use the arrow keys. Press Space again to drop it, or Escape to cancel.",
        },
      }}
    >
      <SortableContext items={ids} strategy={noDisplacement}>
        <div className="grid gap-6 md:grid-cols-2">
          {ordered.map((card) => (
            <Tile key={card.id} card={card} enabled={ordered.length > 1} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={dropAnimation}>
        {active ? (
          <div className="group/tile relative h-full scale-[1.012] cursor-grabbing rounded-xl shadow-[0_22px_45px_-18px_rgb(0_0_0/0.75)] ring-1 ring-champagne/35">
            <div className="h-full [&>*]:h-full">{active.node}</div>
            <Grip label={active.label} props={{ tabIndex: -1, "aria-hidden": true }} lifted />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
