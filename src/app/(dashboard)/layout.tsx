import { requireUser } from "@/lib/auth";
import { MobileNav } from "@/components/mobile-nav";
import { NotificationBell, type BellAlert } from "@/components/notification-bell";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAlertsSeenAt } from "@/lib/ui-preferences";
import { PageTransition } from "@/components/page-transition";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { SIDEBAR_COOKIE, WELCOME_COOKIE } from "@/lib/sidebar-state";
import { Toaster } from "@/components/ui/sonner";
import { WelcomeOverlay } from "@/components/welcome-overlay";
import { calendarNow } from "@/lib/time";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  // The opening animation plays once a browser session, not on every refresh.
  const welcomed = cookieStore.has(WELCOME_COOKIE);
  // The bell's recent alerts, and when it was last opened. A failed read
  // just leaves the bell empty; it never breaks the page.
  const admin = createAdminClient();
  const [alertsRes, alertsSeenAt] = await Promise.all([
    admin.from("alert_events").select("id, kind, title, body, created_at").order("created_at", { ascending: false }).limit(30),
    loadAlertsSeenAt(admin),
  ]);
  if (alertsRes.error) console.error("Failed to load alerts for the bell", alertsRes.error);
  const alerts = (alertsRes.data ?? []) as BellAlert[];
  // Today in Eastern time, worked out here so the server and browser agree.
  const [year, month, day] = calendarNow().isoDate.split("-");
  const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", { month: "short" });

  return (
    // welcome-stage: while the welcome overlay is up, <main> settles into
    // place behind it as it parts (globals.css, "Welcome").
    <div className="welcome-stage flex min-h-screen flex-col md:flex-row">
      {!welcomed && <WelcomeOverlay month={monthName} day={String(Number(day))} year={year} />}
      <MobileNav actions={<NotificationBell alerts={alerts} seenAt={alertsSeenAt} />} />
      <Sidebar defaultCollapsed={sidebarCollapsed} />
      {/* min-w-0 lets wide content (tables, charts) shrink instead of
          stretching the page; the inner cap keeps lines and cards a readable
          width on big monitors instead of spanning the whole screen. */}
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <div className="relative mx-auto w-full max-w-7xl">
          {/* Level with each page's title (both at the top, 32px tall), at
              the right edge of the content; phones have it in the top bar. */}
          <NotificationBell alerts={alerts} seenAt={alertsSeenAt} className="absolute top-0 right-0 z-10 hidden md:inline-flex" />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <Toaster />
    </div>
  );
}
