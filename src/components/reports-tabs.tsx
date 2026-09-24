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
    <nav aria-label="Reports" className="flex items-center gap-1 overflow-x-auto">
      {REPORT_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative mb-1.5 shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-bone/6",
              // The tab you're on is underlined in champagne; every tab lifts on hover.
              "after:absolute after:inset-x-2 after:-bottom-1.5 after:h-0.5 after:rounded-full after:transition-colors",
              active ? "font-medium text-bone after:bg-champagne" : "text-muted-foreground/80 after:bg-transparent hover:text-bone"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
