"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const REPORT_TABS = [
  { href: "/reports/cash-flow", label: "Cash flow" },
  { href: "/reports/spending", label: "Spending" },
  { href: "/reports/income", label: "Income" },
  { href: "/reports/year", label: "Year" },
] as const;

/** The tabs across the top of Reports, one page each. */
export function ReportsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Reports" className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border/70 bg-card/60 p-1">
      {REPORT_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
              // The tab you're on is a filled champagne pill; the rest recede.
              active
                ? "bg-champagne/15 font-medium text-champagne ring-1 ring-champagne/35 ring-inset hover:bg-champagne/20"
                : "text-muted-foreground/80 hover:bg-bone/6 hover:text-bone"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
