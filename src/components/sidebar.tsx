"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  LayoutDashboard,
  ArrowLeftRight,
  RefreshCcw,
  PieChart,
  Target,
  PiggyBank,
  Landmark,
  Settings,
} from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-state";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/reports", label: "Reports", icon: PieChart },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/goals", label: "Goals", icon: PiggyBank },
  { href: "/recurring", label: "Recurring", icon: RefreshCcw },
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
  const toggle = () => setCollapsed((c) => !c);

  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }, [collapsed]);

  // ⌘\ (Ctrl+\ elsewhere) toggles it from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // The handle sits on the sidebar's edge, half outside it, so it lives
    // in this wrapper rather than in the sidebar (which clips its overflow
    // to hide labels while it slides).
    <div className="sticky top-0 z-20 hidden h-screen shrink-0 md:flex">
      <aside
        data-collapsed={collapsed}
        className={cn(
          "flex h-full flex-col overflow-x-hidden overflow-y-auto border-r border-border bg-background px-3 pt-6 pb-4 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* The top row sits level with each page's title (both 24px down,
            32px tall), so the sidebar and page read as one line across. */}
        <Link href="/" aria-label="Ledger.m" className="relative mb-6 flex h-8 shrink-0 items-center px-2">
          <Wordmark
            className={cn(
              "text-2xl whitespace-nowrap transition-opacity",
              collapsed ? "opacity-0 duration-100" : "opacity-100 delay-100 duration-300"
            )}
          />
          {/* Collapsed: the monogram, centered in the rail. */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity",
              collapsed ? "opacity-100 delay-100 duration-300" : "opacity-0 duration-100"
            )}
          >
            <Wordmark short className="text-xl" />
          </span>
        </Link>
        <NavLinks collapsed={collapsed} />
        <div className="mt-auto border-t border-border pt-2">
          <SignOutButton collapsed={collapsed} />
        </div>
      </aside>
      {/* One control in one place, open or collapsed: a small round handle
          on the sidebar's edge, in the gap under the logo (clear of the
          monogram when collapsed). Its chevron turns as the sidebar slides. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={`${collapsed ? "Expand" : "Collapse"} sidebar (⌘\\)`}
        className="absolute top-14 -right-3 inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-ash-grey shadow-sm shadow-black/40 transition-colors hover:border-champagne/60 hover:text-bone focus-visible:border-champagne focus-visible:outline-none"
      >
        <ChevronLeft
          className={cn(
            "size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            collapsed && "rotate-180"
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}
