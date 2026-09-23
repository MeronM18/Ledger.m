import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttentionItem } from "@/lib/attention";
import { cn } from "@/lib/utils";

const TONE_ICON = {
  over: { Icon: AlertTriangle, className: "text-oxblood-text" },
  warning: { Icon: AlertTriangle, className: "text-champagne" },
  info: { Icon: CalendarClock, className: "text-muted-foreground" },
} as const;

/** Leads the overview when something needs a look; renders nothing when all is well. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card className="border-champagne/40">
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.map((item) => {
          const { Icon, className } = TONE_ICON[item.tone];
          return (
            <Link
              key={item.key}
              href={item.href}
              className="group flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <Icon className={cn("size-4 shrink-0", className)} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.detail}</span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
