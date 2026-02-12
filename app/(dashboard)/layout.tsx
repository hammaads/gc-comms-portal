import { Suspense } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex">
        <Suspense>
          <Sidebar />
        </Suspense>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Suspense>
          <Topbar />
        </Suspense>
        <main className="flex-1 animate-page-in overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
