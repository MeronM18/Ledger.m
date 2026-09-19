"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  RefreshCcw,
  PieChart,
  Wallet,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/subscriptions", label: "Subscriptions", icon: RefreshCcw },
  { href: "/spending", label: "Spending", icon: PieChart },
  { href: "/assets", label: "Assets", icon: Wallet },
  { href: "/accounts", label: "Accounts", icon: Landmark },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-background p-4">
      <div className="mb-6 px-2 font-serif text-lg font-bold tracking-tight text-champagne">
        Ledger.m
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 border-l-2 py-2 pr-2 pl-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-champagne text-champagne"
                  : "border-transparent text-ash-grey hover:text-bone"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
