import { Suspense } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense>
          <Topbar />
        </Suspense>
        <InstallPrompt />
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <div className="min-w-0">
            {children}
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
