"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";

const LABEL_MAP: Record<string, string> = {
  drives: "Drives",
  volunteers: "Volunteers",
  duties: "Duties",
  analytics: "Analytics",
  settings: "Settings",
  general: "General",
  assignment: "Assignment",
  whatsapp: "WhatsApp",
  sheets: "Google Sheets",
  calling: "AI Calling",
  reminders: "Reminders",
  alerts: "Alerts",
  assignments: "Duty Board",
  live: "Live Dashboard",
  calls: "Call Center",
  new: "New",
  import: "Import",
  rules: "Rules",
};

export function Topbar() {
  const [seasons, setSeasons] = useState<Tables<"seasons">[]>([]);
  const [activeSeason, setActiveSeason] = useState<string>("");
  const pathname = usePathname();

  useEffect(() => {
    async function loadSeasons() {
      const supabase = createClient();
      const { data } = await supabase
        .from("seasons")
        .select("*")
        .order("start_date", { ascending: false });
      if (data) {
        setSeasons(data);
        const active = data.find((s) => s.is_active);
        if (active) setActiveSeason(active.id);
      }
    }
    loadSeasons();
  }, []);

  async function handleSeasonChange(seasonId: string) {
    setActiveSeason(seasonId);
    const supabase = createClient();
    await supabase.from("seasons").update({ is_active: false }).neq("id", "");
    await supabase
      .from("seasons")
      .update({ is_active: true })
      .eq("id", seasonId);
  }

  // Build breadcrumbs from pathname
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string }[] = [];
  let href = "";
  for (const seg of segments) {
    href += `/${seg}`;
    const label = LABEL_MAP[seg] || seg;
    breadcrumbs.push({ label, href });
  }

  return (
    <header className="flex h-16 items-center gap-4 border-b px-4 md:px-6">
      <MobileSidebar />

      <div className="flex items-center gap-4">
        {seasons.length > 0 && (
          <Select value={activeSeason} onValueChange={handleSeasonChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={season.id}>
                  {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Breadcrumbs */}
      <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <ThemeSwitcher />
        <LogoutButton />
      </div>
    </header>
  );
}
