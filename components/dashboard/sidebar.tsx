"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Users,
  ClipboardList,
  BarChart3,
  ScrollText,
  Settings,
  ChevronDown,
  Moon,
  MoonStar,
  LogOut,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LogoutButton } from "@/components/logout-button";

const primaryNav = [
  { name: "Drives", href: "/drives", icon: CalendarDays },
  { name: "Volunteers", href: "/volunteers", icon: Users },
];

const secondaryNav = [
  { name: "Seasons", href: "/seasons", icon: MoonStar },
  { name: "Duties", href: "/duties", icon: ClipboardList },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Activity Log", href: "/logs", icon: ScrollText },
];

const settingsNav = [
  { name: "Assignment", href: "/settings/assignment" },
  { name: "Sign-up Form", href: "/settings/signup-form" },
  { name: "WhatsApp", href: "/settings/whatsapp" },
  { name: "Google Sheets", href: "/settings/sheets" },
  { name: "AI Calling", href: "/settings/calling" },
  { name: "Reminders", href: "/settings/reminders" },
  { name: "Alerts", href: "/settings/alerts" },
];

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isSeasonsPage = pathname === "/seasons";
  const isSettingsOpen = pathname.startsWith("/settings") && !isSeasonsPage;

  return (
    <>
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Moon className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">Grand Citizens</span>
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {primaryNav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                data-active={isActive}
                className={cn(
                  "nav-item flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="nav-icon h-4 w-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="my-3 border-t" />

        <div className="space-y-0.5">
          {secondaryNav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                data-active={isActive}
                className={cn(
                  "nav-item flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="nav-icon h-3.5 w-3.5 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="pt-1">
          <Link
            href="/settings/assignment"
            onClick={onNavigate}
            data-active={isSettingsOpen}
            className={cn(
              "nav-item flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium",
              isSettingsOpen
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Settings className="nav-icon h-3.5 w-3.5 shrink-0" />
            Settings
            <ChevronDown
              className={cn(
                "nav-icon ml-auto h-4 w-4 transition-transform duration-200 ease-out",
                isSettingsOpen && "rotate-180",
              )}
            />
          </Link>
          {isSettingsOpen && (
            <div className="nav-settings-expand ml-7 mt-1 space-y-1">
              {settingsNav.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "nav-settings-item block rounded-md px-3 py-1.5 text-sm",
                      isActive
                        ? "font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-full w-64 flex-col border-r bg-card lg:flex">
      <SidebarInner />
    </aside>
  );
}

export function MobileSidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col border-r bg-card">
      <SidebarInner onNavigate={onNavigate} />
      <div className="mt-auto flex items-center justify-between border-t p-3">
        <LogoutButton
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
        </LogoutButton>
        <ThemeSwitcher />
      </div>
    </div>
  );
}
