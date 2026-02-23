import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/utils";

type WindowConfig = {
  mode: "next_n_days" | "next_m_drives" | "manual";
  days?: number;
  drive_count?: number;
  start_date?: string;
  end_date?: string;
};

const DEFAULT_WINDOW: WindowConfig = { mode: "next_n_days", days: 7 };

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, 30, 60_000);
  if (limited) return limited;
  try {
    const supabase = createAdminClient();
    const phoneParam = request.nextUrl.searchParams.get("phone");

    const { data: configRow } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "signup_form_window")
      .single();

    const windowConfig: WindowConfig = configRow?.value
      ? { ...DEFAULT_WINDOW, ...(configRow.value as object) }
      : DEFAULT_WINDOW;

    const { data: season } = await supabase
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .single();

    if (!season) {
      return NextResponse.json({
        drives: [],
        signedUpDriveIds: [],
        volunteerPrefill: null,
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("drives")
      .select(
        "id, name, drive_date, location_name, location_address, location_lat, location_lng, arrival_time, sunset_time, iftaar_time, notes",
      )
      .eq("season_id", season.id)
      .in("status", ["open", "in_progress"])
      .gte("drive_date", today)
      .order("drive_date", { ascending: true });

    if (windowConfig.mode === "next_n_days" && windowConfig.days) {
      const end = new Date();
      end.setDate(end.getDate() + windowConfig.days);
      const endStr = end.toISOString().slice(0, 10);
      query = query.lte("drive_date", endStr);
    } else if (windowConfig.mode === "manual" && windowConfig.start_date && windowConfig.end_date) {
      query = query
        .gte("drive_date", windowConfig.start_date)
        .lte("drive_date", windowConfig.end_date);
    }

    const { data: drivesData } = await query;

    let drives = drivesData ?? [];

    if (windowConfig.mode === "next_m_drives" && windowConfig.drive_count) {
      drives = drives.slice(0, windowConfig.drive_count);
    }

    const signedUpDriveIds: string[] = [];
    let volunteerPrefill: {
      name: string;
      email: string | null;
      gender: "male" | "female" | null;
      organization: string | null;
    } | null = null;

    if (phoneParam) {
      const normalizedPhone = normalizePhone(phoneParam);
      const { data: volunteers } = await supabase
        .from("volunteers")
        .select("id, name, email, gender, organization")
        .eq("phone", normalizedPhone)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (volunteers && volunteers.length > 0) {
        const latest = volunteers[0];
        volunteerPrefill = {
          name: latest.name ?? "",
          email: latest.email ?? null,
          gender:
            latest.gender === "male" || latest.gender === "female"
              ? latest.gender
              : null,
          organization: latest.organization ?? null,
        };

        const volunteerIds = volunteers.map((v) => v.id);
        const { data: availability } = await supabase
          .from("volunteer_availability")
          .select("drive_id")
          .in("volunteer_id", volunteerIds);

        const visibleDriveIds = new Set(drives.map((d) => d.id));
        const deduped = new Set(
          (availability ?? [])
            .map((a) => a.drive_id)
            .filter((id): id is string => Boolean(id) && visibleDriveIds.has(id)),
        );
        signedUpDriveIds.push(...deduped);
      }
    }

    return NextResponse.json({ drives, signedUpDriveIds, volunteerPrefill });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[signup-context]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load signup context" },
      { status: 500 },
    );
  }
}
