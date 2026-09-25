"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type Announcements,
  type Collision,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { GripProvider, useCardOrder, type GripWiring } from "@/components/sortable-card-list";
import { applyCardOrder, type CardOrderPage } from "@/lib/card-order";

export type GridCard = {
  id: string;
  // Read out by screen readers while moving the card.
  label: string;
  // How much of the row it takes on a wide screen: all of it, half, a
  // quarter, two thirds and two rows tall ("wide", for a chart with two
  // "side" cards stacked beside it), or a third. Below that, two columns.
  span: "full" | "half" | "quarter" | "wide" | "side";
  node: React.ReactNode;
};

// Same settle curve as the list on Accounts: quick to start, soft to land.
const SETTLE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Cards don't slide by computed offsets (which can't work when a wide card
// trades places with a narrow one); the grid itself is reordered as the
// card is dragged, and each card animates from where it was to where the
// new layout puts it.
const noDisplacement = () => null;

// Where a card goes is decided by the card, not the pointer (which is on
// the grip at its corner): it takes the place of the card its center is
// over. In a gap between cards, it takes the place of one it mostly covers
// (which is also how a keyboard move, landing it squarely on the next
// card, is read). Over its own place it stays put, and that's reported as
// such: the keyboard's arrow keys skip the current match to find the next
// card, and the lifted card (a touch larger) would otherwise find itself.
// Judged against where cards settle, not mid-animation.
const collisionDetection: CollisionDetection = ({ active, collisionRect, droppableRects, droppableContainers }) => {
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: { container: (typeof droppableContainers)[number]; cover: number } | null = null;
  for (const container of droppableContainers) {
    const r = droppableRects.get(container.id);
    if (!r) continue;
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
      return [{ id: container.id, data: { droppableContainer: container, value: 1 } }] satisfies Collision[];
    }
    if (container.id === active.id) continue;
    const w = Math.min(collisionRect.right, r.right) - Math.max(collisionRect.left, r.left);
    const h = Math.min(collisionRect.bottom, r.bottom) - Math.max(collisionRect.top, r.top);
    if (w <= 0 || h <= 0) continue;
    const cover = (w * h) / Math.min(r.width * r.height, collisionRect.width * collisionRect.height);
    if (cover >= 0.5 && (!best || cover > best.cover)) best = { container, cover };
  }
  return best ? [{ id: best.container.id, data: { droppableContainer: best.container, value: best.cover } }] : [];
};

// How far the pointer has to travel after one trade of places before the next.
const MOVE_BEFORE_NEXT_SWAP = 24;

const dropAnimation: DropAnimation = {
  duration: 260,
  easing: SETTLE,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
};

// The grip on the card being carried: shown lifted, but not something to
// focus or press (the real one is on the card in the grid).
const CARRIED_GRIP_ATTRIBUTES: GripWiring["attributes"] = {
  role: "button",
  tabIndex: -1,
  "aria-disabled": true,
  "aria-pressed": undefined,
  "aria-roledescription": "sortable",
  "aria-describedby": "",
};
const noRef = () => {};

// Two columns up to a wide screen: quarters pair up, even on a phone; the
// rest take both until there's room for halves and thirds.
const SPAN: Record<GridCard["span"], string> = {
  full: "col-span-2 xl:col-span-12",
  half: "col-span-2 md:col-span-1 xl:col-span-6",
  quarter: "col-span-1 xl:col-span-3",
  wide: "col-span-2 xl:col-span-8 xl:row-span-2",
  side: "col-span-2 md:col-span-1 xl:col-span-4",
};

function Tile({ card, enabled }: { card: GridCard; enabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !enabled,
    transition: { duration: 380, easing: SETTLE },
    // Animate every move, including the live reorders while dragging.
    animateLayoutChanges: () => true,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/card relative min-w-0", SPAN[card.span])}
    >
      {/* While it's being carried, its place in the grid shows as an outline
          of where it will land. Cards fill their tile, so two side by side
          stay the same height. The grip (DragHandle) is in each card's
          header, beside its title, as on Accounts. */}
      <GripProvider
        value={enabled ? { attributes, listeners, label: card.label, isDragging } : null}
        activatorRef={setActivatorNodeRef}
      >
        <div className={cn("h-full transition-opacity duration-200 [&>*]:h-full", isDragging && "opacity-0")}>{card.node}</div>
      </GripProvider>
      {isDragging && (
        <div aria-hidden className="absolute inset-0 rounded-xl border border-dashed border-champagne/45 bg-champagne/[0.04]" />
      )}
    </div>
  );
}

/**
 * A grid of cards (twelve columns on a wide screen, two below that) the user can rearrange
 * by the grip beside each card's title, with the mouse, a finger, or the
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
        {/* Dense, so two side cards fill the rows beside a wide one wherever it's moved. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-flow-dense xl:grid-cols-12">
          {ordered.map((card) => (
            <Tile key={card.id} card={card} enabled={ordered.length > 1} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={dropAnimation}>
        {active ? (
          <div className="h-full scale-[1.012] cursor-grabbing rounded-xl shadow-[0_22px_45px_-18px_rgb(0_0_0/0.75)] ring-1 ring-champagne/35 [&>*]:h-full">
            <GripProvider
              value={{ attributes: CARRIED_GRIP_ATTRIBUTES, listeners: undefined, label: active.label, isDragging: true }}
              activatorRef={noRef}
            >
              {active.node}
            </GripProvider>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
