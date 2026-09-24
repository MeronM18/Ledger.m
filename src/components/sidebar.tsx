"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  ArrowLeftRight,
  RefreshCcw,
  PieChart,
  Target,
  TrendingUp,
  PiggyBank,
  Wallet,
  Landmark,
  HandCoins,
  Settings,
  CalendarRange,
} from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-state";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/subscriptions", label: "Subscriptions", icon: RefreshCcw },
  { href: "/spending", label: "Spending", icon: PieChart },
  { href: "/income", label: "Income", icon: HandCoins },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/cash-flow", label: "Cash flow", icon: TrendingUp },
  { href: "/goals", label: "Goals", icon: PiggyBank },
  { href: "/year-in-review", label: "Year in review", icon: CalendarRange },
  { href: "/assets", label: "Assets", icon: Wallet },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** A label beside an icon: fades out as the sidebar collapses, back in once it has room again. */
function RailLabel({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "truncate transition-opacity",
        collapsed ? "opacity-0 duration-100" : "opacity-100 delay-100 duration-300"
      )}
    >
      {children}
    </span>
  );
}

/**
 * The wordmark: "Ledger" in bone, ".m" in champagne, as in the welcome
 * animation. `short` is the monogram ("L.m") for the collapsed rail.
 */
export function Wordmark({ className, short = false }: { className?: string; short?: boolean }) {
  return (
    <span className={cn("font-serif font-semibold leading-none tracking-tight text-bone", className)}>
      {short ? "L" : "Ledger"}
      <span className="text-champagne">.m</span>
    </span>
  );
}

/** The nav links, shared by the desktop sidebar and the mobile drawer. */
export function NavLinks({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
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
            // Collapsed, the name shows on hover.
            title={collapsed ? label : undefined}
            className={cn(
              "flex items-center gap-3 overflow-hidden border-l-2 py-2 pr-2 pl-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "border-champagne text-champagne" : "border-transparent text-ash-grey hover:text-bone"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <RailLabel collapsed={collapsed}>{label}</RailLabel>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Desktop only (md and up); phones use MobileNav. Sticky so it stays put
 * while a long page scrolls. Collapses to a rail of icons: its width
 * animates, and since the page beside it fills the rest of the row, every
 * page reflows with it frame by frame.
 */
export function Sidebar({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-border bg-background px-3 pt-6 pb-4 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* The top row sits level with each page's title (both 24px down,
          32px tall), so the sidebar and page read as one line across. */}
      <div className="relative mb-6 h-8 shrink-0">
        {/* Expanded: the wordmark, and the collapse button at the right. */}
        <div
          inert={collapsed}
          className={cn(
            "absolute inset-0 flex items-center justify-between gap-2 transition-opacity",
            collapsed ? "opacity-0 duration-100" : "opacity-100 delay-100 duration-300"
          )}
        >
          <Link href="/" aria-label="Ledger.m" className="px-2">
            <Wordmark className="text-2xl whitespace-nowrap" />
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-expanded
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ash-grey transition-colors hover:bg-muted hover:text-bone"
          >
            <PanelLeftClose className="size-4" aria-hidden />
          </button>
        </div>
        {/* Collapsed: the monogram, which turns into the expand icon on hover. */}
        <button
          type="button"
          onClick={toggle}
          inert={!collapsed}
          aria-expanded={false}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className={cn(
            "group absolute inset-0 flex cursor-pointer items-center justify-center rounded-md transition-[opacity,background-color] hover:bg-muted",
            collapsed ? "opacity-100 delay-100 duration-300" : "opacity-0 duration-100"
          )}
        >
          <Wordmark short className="text-xl transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0" />
          <PanelLeftOpen
            className="absolute size-4 text-bone opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        </button>
      </div>
      <NavLinks collapsed={collapsed} />
      <div className="mt-auto border-t border-border pt-2">
        <SignOutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}
