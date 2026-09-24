import { requireUser } from "@/lib/auth";
import { MobileNav } from "@/components/mobile-nav";
import { PageTransition } from "@/components/page-transition";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { WelcomeOverlay } from "@/components/welcome-overlay";
import { calendarNow } from "@/lib/time";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  // Today in Eastern time, worked out here so the server and browser agree.
  const [year, month, day] = calendarNow().isoDate.split("-");
  const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", { month: "short" });

  return (
    // welcome-stage: while the welcome overlay is up, <main> settles into
    // place behind it as it parts (globals.css, "Welcome").
    <div className="welcome-stage flex min-h-screen flex-col md:flex-row">
      <WelcomeOverlay month={monthName} day={String(Number(day))} year={year} />
      <MobileNav />
      <Sidebar />
      {/* min-w-0 lets wide content (tables, charts) shrink instead of
          stretching the page; the inner cap keeps lines and cards a readable
          width on big monitors instead of spanning the whole screen. */}
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <div className="mx-auto w-full max-w-7xl">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <Toaster />
    </div>
  );
}
