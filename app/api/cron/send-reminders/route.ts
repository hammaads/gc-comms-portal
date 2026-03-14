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

  return await Sentry.withMonitor("send-reminders", async () => {
    const { data: waConf } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "whatsapp")
      .single();
    if (!(waConf?.value as any)?.enabled) {
      return NextResponse.json({ skipped: true, reason: "whatsapp disabled" });
    }

    const now = new Date().toISOString();
    const { data: pendingReminders } = await supabase
      .from("reminder_schedules")
      .select("*, drives(name, location_name, sunset_time)")
      .eq("is_sent", false)
      .lte("scheduled_at", now);

    if (!pendingReminders || pendingReminders.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    let totalSent = 0;

    for (const reminder of pendingReminders) {
      // Atomically claim the reminder to prevent duplicate sends
      const { data: claimed } = await supabase
        .from("reminder_schedules")
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq("id", reminder.id)
        .eq("is_sent", false)
        .select("id");

      if (!claimed || claimed.length === 0) continue; // Already claimed

      const drive = reminder.drives as any;
      const { data: assignments } = await supabase
        .from("assignments")
        .select("volunteer_id, duty_id, volunteers(name, phone), duties(name)")
        .eq("drive_id", reminder.drive_id)
        .in("status", ["assigned", "confirmed"]);

      if (!assignments) continue;

      let successCount = 0;

      for (const assignment of assignments) {
        const volunteer = assignment.volunteers as any;
        const duty = assignment.duties as any;
        if (!volunteer?.phone) continue;

        let message = reminder.message_template || "";
        message = message
          .replace(/{name}/g, volunteer.name || "")
          .replace(/{duty}/g, duty?.name || "")
          .replace(/{drive_name}/g, drive?.name || "")
          .replace(/{sunset_time}/g, drive?.sunset_time || "")
          .replace(/{location}/g, drive?.location_name || "");

        try {
          await sendWhatsAppMessage(volunteer.phone, message);
          successCount++;
          totalSent++;

          await supabase.from("communication_log").insert({
            volunteer_id: assignment.volunteer_id,
            drive_id: reminder.drive_id,
            channel: "whatsapp",
            direction: "outbound",
            content: message,
            sent_at: new Date().toISOString(),
          });
        } catch (error) {
          console.error(
            `[cron/send-reminders] Failed to send to ${volunteer.phone}:`,
            error,
          );
        }
      }

      // Release claim if all sends failed so the next cycle can retry
      if (successCount === 0) {
        await supabase
          .from("reminder_schedules")
          .update({ is_sent: false, sent_at: null })
          .eq("id", reminder.id);
        console.error(
          `[cron/send-reminders] All sends failed for reminder ${reminder.id} — will retry`,
        );
      }
    }

    return NextResponse.json({ sent: totalSent });
  });
}
