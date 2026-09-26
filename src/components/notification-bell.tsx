"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CalendarClock,
  CalendarRange,
  CreditCard,
  FileUp,
  HandCoins,
  Landmark,
  Receipt,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BellAlert = { id: string; kind: string; title: string; body: string; created_at: string };

// An icon, and its color, for what each kind of alert is about.
const KIND: Record<string, { Icon: LucideIcon; className: string }> = {
  "budget-over": { Icon: AlertTriangle, className: "text-oxblood-text" },
  "budget-warning": { Icon: AlertTriangle, className: "text-champagne" },
  "low-balance": { Icon: AlertTriangle, className: "text-oxblood-text" },
  "bank-signin": { Icon: Landmark, className: "text-oxblood-text" },
  "import-reminder": { Icon: FileUp, className: "text-champagne" },
  renewal: { Icon: CalendarClock, className: "text-muted-foreground" },
  "price-increase": { Icon: TrendingUp, className: "text-champagne" },
  "unusual-charge": { Icon: Receipt, className: "text-champagne" },
  "large-charge": { Icon: Receipt, className: "text-champagne" },
  "high-utilization": { Icon: CreditCard, className: "text-champagne" },
  transaction: { Icon: ArrowLeftRight, className: "text-muted-foreground" },
  "monthly-summary": { Icon: CalendarRange, className: "text-moss" },
  "deposit-review": { Icon: HandCoins, className: "text-champagne" },
};
// Where an alert of each kind takes you, for the ones with something to do.
const HREF: Record<string, string> = {
  "deposit-review": "/transactions/deposits",
};
const FALLBACK = { Icon: Bell, className: "text-muted-foreground" };

/**
 * The bell at the top right: a count of alerts that came in since it was
 * last opened, and a list of recent ones below it. Opening it marks them
 * seen (up to the newest one it showed), on every device.
 */
export function NotificationBell({ alerts, seenAt, className }: { alerts: BellAlert[]; seenAt: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  // When it was last opened here: the stored mark, moved forward on open.
  const [seen, setSeen] = useState(seenAt);
  // What counted as new when this list was opened, so those keep their dot
  // while it's open even though they're now marked seen.
  const [newWhenOpened, setNewWhenOpened] = useState<Set<string>>(new Set());

  const isNew = (a: BellAlert) => seen === null || Date.parse(a.created_at) > Date.parse(seen);
  const unread = alerts.filter(isNew).length;
  const newest = alerts[0]?.created_at ?? null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next || unread === 0 || !newest) return;
    setNewWhenOpened(new Set(alerts.filter(isNew).map((a) => a.id)));
    setSeen(newest);
    void fetch("/api/alerts/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen_through: newest }),
    }).catch(() => {
      // Not saved: the count comes back on the next load, nothing is lost.
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Alerts, ${unread} new` : "Alerts"}
          className={cn(
            "relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-ash-grey transition-colors hover:bg-muted hover:text-bone data-[state=open]:bg-muted data-[state=open]:text-bone",
            className
          )}
        >
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-champagne px-1 font-mono text-[10px] leading-none font-semibold text-onyx tabular-nums ring-2 ring-background"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-96 flex-col gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Alerts</p>
          {newWhenOpened.size > 0 && <p className="text-xs text-muted-foreground">{newWhenOpened.size} new</p>}
        </div>
        {alerts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            You&apos;re all caught up. Budget, renewal, balance and other alerts show up here and on your phone.
          </p>
        ) : (
          <ul className="max-h-[min(28rem,70dvh)] overflow-y-auto">
            {alerts.map((a) => {
              const { Icon, className: tone } = KIND[a.kind] ?? FALLBACK;
              const fresh = newWhenOpened.has(a.id);
              return (
                <li
                  key={a.id}
                  className={cn("flex gap-3 border-b border-border px-4 py-3 last:border-b-0", fresh && "bg-champagne/[0.04]")}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.body}</p>
                    {HREF[a.kind] && (
                      <Link href={HREF[a.kind]} onClick={() => setOpen(false)} className="mt-0.5 self-start text-xs text-champagne underline-offset-4 hover:underline">
                        Review it
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                    {fresh && <span className="size-1.5 rounded-full bg-champagne" aria-label="New" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground transition-colors hover:text-champagne"
          >
            Choose which alerts you get
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
