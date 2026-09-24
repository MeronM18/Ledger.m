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
              "relative shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "text-champagne" : "text-muted-foreground hover:bg-muted hover:text-bone"
            )}
          >
            {tab.label}
            {active && <span className="absolute inset-x-3 -bottom-0.5 h-px bg-champagne" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
