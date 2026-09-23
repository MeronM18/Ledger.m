import { requireUser } from "@/lib/auth";
import { MobileNav } from "@/components/mobile-nav";
import { PageTransition } from "@/components/page-transition";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
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
