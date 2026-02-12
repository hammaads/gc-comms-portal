"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Users,
  ClipboardList,
  BarChart3,
  Settings,
  ChevronDown,
  Moon,
} from "lucide-react";

const navigation = [
  { name: "Drives", href: "/drives", icon: CalendarDays },
  { name: "Volunteers", href: "/volunteers", icon: Users },
  { name: "Duties", href: "/duties", icon: ClipboardList },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
];

const settingsNav = [
  { name: "General", href: "/settings/general" },
  { name: "Assignment", href: "/settings/assignment" },
  { name: "WhatsApp", href: "/settings/whatsapp" },
  { name: "Google Sheets", href: "/settings/sheets" },
  { name: "AI Calling", href: "/settings/calling" },
  { name: "Reminders", href: "/settings/reminders" },
  { name: "Alerts", href: "/settings/alerts" },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isSettingsOpen = pathname.startsWith("/settings");

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar-bg">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent/20">
          <Moon className="h-4 w-4 text-sidebar-accent" />
        </div>
        <div>
          <span className="text-sm font-bold text-sidebar-fg">Grand Citizens</span>
          <p className="text-[10px] text-sidebar-fg/50">Volunteer Management</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent/15 text-sidebar-accent"
                  : "text-sidebar-fg/60 hover:bg-sidebar-muted hover:text-sidebar-fg",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}

        <div className="pt-4">
          <Link
            href="/settings/general"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isSettingsOpen
                ? "bg-sidebar-accent/15 text-sidebar-accent"
                : "text-sidebar-fg/60 hover:bg-sidebar-muted hover:text-sidebar-fg",
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 transition-transform duration-200",
                isSettingsOpen && "rotate-180",
              )}
            />
          </Link>
          <div
            className="ml-7 overflow-hidden transition-all duration-200"
            style={{
              display: "grid",
              gridTemplateRows: isSettingsOpen ? "1fr" : "0fr",
            }}
          >
            <div className="min-h-0">
              <div className="mt-1 space-y-1">
                {settingsNav.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "block rounded-md px-3 py-1.5 text-sm transition-colors",
                        isActive
                          ? "font-medium text-sidebar-accent"
                          : "text-sidebar-fg/50 hover:text-sidebar-fg",
                      )}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </aside>
  );
}
