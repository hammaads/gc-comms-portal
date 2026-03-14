import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/whatsapp/cloud-client";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  // Vercel Cron authentication
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  return await Sentry.withMonitor("auto-reminders", async () => {
    const { data: config } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "whatsapp")
      .single();

    const waConfig = config?.value as {
      enabled?: boolean;
      auto_reminders_enabled?: boolean;
      auto_reminder_template?: string;
    } | null;

    if (!waConfig?.enabled || !waConfig?.auto_reminders_enabled) {
      return NextResponse.json({ skipped: true, reason: "auto-reminders disabled" });
    }

    const template =
      waConfig.auto_reminder_template ||
      "Assalam o Alaikum {name}! Reminder: You are assigned to {duty} for {drive_name} at {location}. {days_remaining} day(s) remaining. Please confirm by replying YES.";

    const today = new Date().toISOString().split("T")[0];
    const { data: drives } = await supabase
      .from("drives")
      .select("id, name, drive_date, location_name, sunset_time")
      .gte("drive_date", today)
      .in("status", ["open", "in_progress"]);

    if (!drives || drives.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const now = new Date();
    let totalSent = 0;

    for (const drive of drives) {
      const driveDate = new Date(drive.drive_date + "T00:00:00");
      const diffMs =
        driveDate.getTime() - new Date(today + "T00:00:00").getTime();
      const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

      // Dedup window: >1 day away = 24h, ≤1 day away = 12h
      const windowHours = daysRemaining > 1 ? 24 : 12;
      const windowStart = new Date(
        now.getTime() - windowHours * 60 * 60 * 1000,
      ).toISOString();

      const { data: assignments } = await supabase
        .from("assignments")
        .select("volunteer_id, duty_id, volunteers(name, phone), duties(name)")
        .eq("drive_id", drive.id)
        .in("status", ["assigned", "confirmed"]);

      if (!assignments || assignments.length === 0) continue;

      const volunteerIds = assignments.map((a) => a.volunteer_id);
      const { data: recentLogs } = await supabase
        .from("communication_log")
        .select("volunteer_id")
        .eq("drive_id", drive.id)
        .eq("channel", "whatsapp")
        .eq("direction", "outbound")
        .like("content", "[auto-reminder]%")
        .gte("sent_at", windowStart)
        .in("volunteer_id", volunteerIds);

      const alreadySent = new Set(
        (recentLogs || []).map((l: { volunteer_id: string }) => l.volunteer_id),
      );

      for (const assignment of assignments) {
        if (alreadySent.has(assignment.volunteer_id)) continue;

        const volunteer = assignment.volunteers as any;
        const duty = assignment.duties as any;
        if (!volunteer?.phone) continue;

        const message =
          "[auto-reminder] " +
          template
            .replace(/{name}/g, volunteer.name || "")
            .replace(/{duty}/g, duty?.name || "")
            .replace(/{drive_name}/g, drive.name || "")
            .replace(/{location}/g, drive.location_name || "")
            .replace(/{sunset_time}/g, drive.sunset_time || "")
            .replace(/{days_remaining}/g, String(daysRemaining));

        try {
          await sendWhatsAppMessage(volunteer.phone, message);
          totalSent++;

          await supabase.from("communication_log").insert({
            volunteer_id: assignment.volunteer_id,
            drive_id: drive.id,
            channel: "whatsapp",
            direction: "outbound",
            content: message,
            sent_at: new Date().toISOString(),
          });
        } catch (error) {
          console.error(
            `[cron/auto-reminders] Failed for ${volunteer.phone}:`,
            error,
          );
        }
      }
    }

    return NextResponse.json({ sent: totalSent });
  });
}
