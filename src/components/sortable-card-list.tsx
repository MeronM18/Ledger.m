"use client";

import { createContext, useContext, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { applyCardOrder, type CardOrderPage } from "@/lib/card-order";

export type SortableCard = {
  id: string;
  // Read out by screen readers while moving the card ("Chase was moved to position 2 of 4").
  label: string;
  node: React.ReactNode;
};

// Same settle curve as the login entrance: quick to start, soft to land.
const SETTLE = "cubic-bezier(0.16, 1, 0.3, 1)";

type Sortable = ReturnType<typeof useSortable>;
type HandleContextValue = {
  // What dnd-kit puts on the grip: its aria attributes and pointer/key listeners.
  attributes: Sortable["attributes"];
  listeners: Sortable["listeners"];
  label: string;
  isDragging: boolean;
};

const HandleContext = createContext<HandleContextValue | null>(null);
// Tells dnd-kit which element is the grip, so keyboard focus returns to it
// after a drop. Kept apart from the rest: it's a ref callback, only ever
// handed to `ref`, and React's lint treats everything beside it as a ref too.
const HandleRefContext = createContext<Sortable["setActivatorNodeRef"] | null>(null);

/**
 * The grip a card is dragged by. Rendered inside a card's header; outside a
 * SortableCardList (or when there's only one card) it renders nothing. Only
 * the grip starts a drag, so buttons in the card keep working and a phone
 * can still scroll by swiping the card itself.
 */
export function DragHandle({ className }: { className?: string }) {
  const ctx = useContext(HandleContext);
  const attachHandle = useContext(HandleRefContext);
  if (!ctx || !attachHandle) return null;
  return (
    <button
      type="button"
      ref={attachHandle}
      {...ctx.attributes}
      {...ctx.listeners}
      aria-label={`Move ${ctx.label}`}
      className={cn(
        "-ml-1.5 inline-flex size-7 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground/70 transition-colors",
        "cursor-grab hover:bg-muted hover:text-champagne focus-visible:text-champagne active:cursor-grabbing",
        ctx.isDragging && "cursor-grabbing bg-muted text-champagne",
        className
      )}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

/**
 * Hands the DragHandle inside a card its drag wiring. SortableCardList and
 * SortableCardGrid both use it, so a card's grip looks and works the same
 * on every page.
 */
export function GripProvider({
  value,
  activatorRef,
  children,
}: {
  value: HandleContextValue | null;
  activatorRef: Sortable["setActivatorNodeRef"] | null;
  children: React.ReactNode;
}) {
  return (
    <HandleRefContext.Provider value={activatorRef}>
      <HandleContext.Provider value={value}>{children}</HandleContext.Provider>
    </HandleRefContext.Provider>
  );
}

export type GripWiring = HandleContextValue;

function SortableItem({ card, enabled }: { card: SortableCard; enabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !enabled,
    transition: { duration: 280, easing: SETTLE },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        // Translate only: cards differ in height, and dnd-kit's scale would squash them.
        transform: CSS.Translate.toString(transform),
        transition: [transition, `box-shadow 220ms ${SETTLE}`, `scale 220ms ${SETTLE}`].filter(Boolean).join(", "),
      }}
      className={cn(
        "relative rounded-xl",
        isDragging && "z-10 scale-[1.012] shadow-[0_22px_45px_-18px_rgb(0_0_0/0.75)] ring-1 ring-champagne/35"
      )}
    >
      <GripProvider
        value={enabled ? { attributes, listeners, label: card.label, isDragging } : null}
        activatorRef={setActivatorNodeRef}
      >
        {card.node}
      </GripProvider>
    </div>
  );
}

/**
 * The order the user has arranged a page's cards in, and saving it. The
 * order is reconciled against `cards` on every render, so a card added or
 * removed by a refresh still shows up (or disappears) without resetting the
 * arrangement. `save` stores it for every device; if that fails, the cards
 * go back to `previous`.
 */
export function useCardOrder<T extends { id: string }>(page: CardOrderPage, cards: T[]) {
  const [order, setOrder] = useState(() => cards.map((c) => c.id));
  const saveSeq = useRef(0);
  const ordered = applyCardOrder(cards, (c) => c.id, order);

  async function save(next: string[], previous: string[]) {
    const seq = ++saveSeq.current;
    try {
      const res = await fetch("/api/card-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, order: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Only undo if no later move has been made since; that one wins.
      if (seq !== saveSeq.current) return;
      setOrder(previous);
      toast.error("Couldn't save the new order, so the cards went back to where they were.");
    }
  }

  return { ordered, ids: ordered.map((c) => c.id), setOrder, save };
}

/**
 * A vertical stack of cards the user can reorder by their grip, with the
 * mouse, a finger, or the keyboard (focus the grip, Space to lift, arrows to
 * move, Space to drop). The new order is saved right away and comes back on
 * every device; if saving fails, the cards go back to where they were.
 */
export function SortableCardList({ page, cards }: { page: CardOrderPage; cards: SortableCard[] }) {
  const { ordered, ids, setOrder, save } = useCardOrder(page, cards);
  const labelOf = (id: string | number) => cards.find((c) => c.id === id)?.label ?? "Card";

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click on the grip isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrder(next);
    void save(next, ids);
  }

  const position = (id: string | number) => `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, ${position(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} moved to ${position(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} dropped at ${position(over.id)}.` : `${labelOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled. It's back where it started.`,
  };

  return (
    <DndContext
      id={`card-order-${page}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "To move this card, press Space, then use the up and down arrow keys. Press Space again to drop it, or Escape to cancel.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-4">
          {ordered.map((card) => (
            <SortableItem key={card.id} card={card} enabled={ordered.length > 1} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
