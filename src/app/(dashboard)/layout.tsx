import { requireUser } from "@/lib/auth";
import { PageTransition } from "@/components/page-transition";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">
        <PageTransition>{children}</PageTransition>
      </main>
      <Toaster />
    </div>
  );
}
