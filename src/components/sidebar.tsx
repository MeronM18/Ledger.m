"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  RefreshCcw,
  PieChart,
  Target,
  TrendingUp,
  PiggyBank,
  Wallet,
  Landmark,
} from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/subscriptions", label: "Subscriptions", icon: RefreshCcw },
  { href: "/spending", label: "Spending", icon: PieChart },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/cash-flow", label: "Cash flow", icon: TrendingUp },
  { href: "/goals", label: "Goals", icon: PiggyBank },
  { href: "/assets", label: "Assets", icon: Wallet },
  { href: "/accounts", label: "Accounts", icon: Landmark },
];

/** The nav links, shared by the desktop sidebar and the mobile drawer. */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 border-l-2 py-2 pr-2 pl-2.5 text-sm font-medium transition-colors",
              isActive ? "border-champagne text-champagne" : "border-transparent text-ash-grey hover:text-bone"
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop only (md and up); phones use MobileNav. Sticky so it stays put while a long page scrolls. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-background p-4 md:flex">
      <div className="mb-6 px-2 font-serif text-lg font-bold tracking-tight text-champagne">Ledger.m</div>
      <NavLinks />
      <div className="mt-auto border-t border-border pt-2">
        <SignOutButton />
      </div>
    </aside>
  );
}
