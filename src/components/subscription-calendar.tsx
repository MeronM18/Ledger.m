"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CalendarEvent = { key: string; date: string; name: string; amount: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A month grid of upcoming renewals. `todayIso` comes from the server (the
 * Eastern calendar day) so the highlighted day and the starting month agree
 * with every other page instead of following the browser's clock. A
 * charge opens its subscription's panel.
 */
export function SubscriptionCalendar({
  events,
  todayIso,
  currency,
  onOpen,
}: {
  events: CalendarEvent[];
  todayIso: string;
  currency: string;
  onOpen: (key: string) => void;
}) {
  const startYear = Number(todayIso.slice(0, 4));
  const startMonth = Number(todayIso.slice(5, 7)) - 1;
  const [offset, setOffset] = useState(0); // months from the current one

  const view = new Date(startYear, startMonth + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = view.getDay();
  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7;

  // Only months that can hold data: this one and the ones the events reach.
  const lastEventMonth = useMemo(() => {
    const last = events.reduce((max, e) => (e.date > max ? e.date : max), todayIso);
    return (Number(last.slice(0, 4)) - startYear) * 12 + (Number(last.slice(5, 7)) - 1 - startMonth);
  }, [events, todayIso, startYear, startMonth]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);

  const monthEvents = events.filter((e) => e.date.startsWith(iso(year, month, 1).slice(0, 7)));
  const monthTotal = monthEvents.reduce((sum, e) => sum + e.amount, 0);
  const monthLabel = view.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle>Renewal calendar</CardTitle>
          <p className="text-xs text-muted-foreground">
            {monthEvents.length === 0 ? (
              <>Nothing expected in {monthLabel}</>
            ) : (
              <>
                {monthEvents.length} {offset === 0 ? "still to come" : "expected"} ·{" "}
                <span className="font-mono text-bone tabular-nums">{formatCurrency(monthTotal, currency)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Previous month" disabled={offset <= 0} onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-32 text-center text-sm text-bone">{monthLabel}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next month"
            disabled={offset >= lastEventMonth}
            onClick={() => setOffset((o) => o + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-muted/40 px-2 py-1.5 text-center text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {d}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`lead-${i}`} className="min-h-12 bg-card/40 sm:min-h-16" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const date = iso(year, month, day);
            const dayEvents = byDay.get(date) ?? [];
            const isToday = date === todayIso;
            const past = date < todayIso;
            return (
              <div
                key={date}
                className={cn("flex min-h-12 min-w-0 flex-col gap-0.5 bg-card p-1 sm:min-h-16 sm:p-1.5", isToday && "ring-1 ring-champagne/50 ring-inset")}
                title={dayEvents.map((e) => `${e.name} ${formatCurrency(e.amount, currency)}`).join("\n") || undefined}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                    isToday ? "bg-champagne font-semibold text-background" : past ? "text-muted-foreground/50" : "text-muted-foreground"
                  )}
                >
                  {day}
                </span>
                {/* Names only fit from tablet width up; a phone cell shows dots and the list below has the detail. */}
                <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                  {dayEvents.slice(0, 3).map((e, idx) => (
                    <span key={idx} className="size-1.5 rounded-full bg-champagne" />
                  ))}
                </span>
                {dayEvents.slice(0, 2).map((e, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onOpen(e.key)}
                    className="hidden w-full min-w-0 items-center justify-between gap-1 rounded border-l-2 border-champagne/70 bg-bone/6 px-1 text-left text-[10px] leading-4 text-bone transition-colors hover:bg-bone/12 sm:flex"
                  >
                    <span className="truncate">{e.name}</span>
                    <span className="hidden shrink-0 font-mono text-muted-foreground tabular-nums xl:inline">{Math.round(e.amount)}</span>
                  </button>
                ))}
                {dayEvents.length > 2 && <span className="hidden text-[10px] text-muted-foreground sm:block">+{dayEvents.length - 2} more</span>}
              </div>
            );
          })}
          {Array.from({ length: trailingBlanks }, (_, i) => (
            <div key={`trail-${i}`} className="min-h-12 bg-card/40 sm:min-h-16" />
          ))}
        </div>

        {monthEvents.length > 0 && (
          <ul className="flex flex-col sm:hidden">
            {monthEvents.map((e, i) => (
              <li key={`${e.date}-${e.key}-${i}`} className="border-t border-border first:border-t-0">
                <button type="button" onClick={() => onOpen(e.key)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
                  <span className="min-w-0 text-sm">
                    <span className="text-bone">{e.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {new Date(`${e.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular-nums">{formatCurrency(e.amount, currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
