import { CronJob } from "cron";
import * as Sentry from "@sentry/node";
import { SupabaseClient } from "@supabase/supabase-js";
import { WhatsAppManager } from "../whatsapp/connection";
import { GoogleSheetsSync } from "../sheets/sync";
import { RetellClient } from "../calling/retell-client";
import { cronLogger } from "../lib/logger";

export function setupCronJobs(
  supabase: SupabaseClient,
  whatsapp: WhatsAppManager,
  sheetsSync: GoogleSheetsSync,
  retell: RetellClient,
): void {
  // Google Sheets sync - every 5 minutes
  new CronJob("*/5 * * * *", () => {
    Sentry.withMonitor("sheets-sync", async () => {
      cronLogger.info("Google Sheets sync started");
      const result = await sheetsSync.syncAll();
      if (result.synced > 0) {
        cronLogger.info({ synced: result.synced }, "Synced new volunteers");
      }
    }, {
      schedule: { type: "crontab", value: "*/5 * * * *" },
    }).catch((error) => {
      cronLogger.error({ err: error }, "Sheets sync error");
    });
  }).start();

  // Send reminders - every minute
  new CronJob("* * * * *", () => {
    Sentry.withMonitor("send-reminders", async () => {
      const { data: waConf } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "whatsapp")
        .single();
      if (!(waConf?.value as any)?.enabled) return;

      const now = new Date().toISOString();
      const { data: pendingReminders } = await supabase
        .from("reminder_schedules")
        .select("*, drives(name, location_name, sunset_time)")
        .eq("is_sent", false)
        .lte("scheduled_at", now);

      if (!pendingReminders || pendingReminders.length === 0) return;

      for (const reminder of pendingReminders) {
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
            await whatsapp.sendMessage(volunteer.phone, message);
            successCount++;

            await supabase.from("communication_log").insert({
              volunteer_id: assignment.volunteer_id,
              drive_id: reminder.drive_id,
              channel: "whatsapp",
              direction: "outbound",
              content: message,
              sent_at: new Date().toISOString(),
            });
          } catch (error) {
            cronLogger.error(
              { err: error, phone: volunteer.phone },
              "Failed to send reminder",
            );
          }
        }

        if (successCount > 0) {
          await supabase
            .from("reminder_schedules")
            .update({ is_sent: true, sent_at: new Date().toISOString() })
            .eq("id", reminder.id);
        } else {
          cronLogger.error(
            { reminderId: reminder.id, driveId: reminder.drive_id },
            "All reminder sends failed — will retry next cycle",
          );
        }
      }
    }, {
      schedule: { type: "crontab", value: "* * * * *" },
    }).catch((error) => {
      cronLogger.error({ err: error }, "Reminder send error");
    });
  }).start();

  // Trigger AI calls - every minute
  new CronJob("* * * * *", () => {
    Sentry.withMonitor("ai-call-trigger", async () => {
      const { data: config } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "ai_calling")
        .single();

      const aiConfig = config?.value as {
        enabled: boolean;
        auto_call_hours_before_sunset: number;
      } | null;
      if (!aiConfig?.enabled) return;

      const today = new Date().toISOString().split("T")[0];
      const { data: drives } = await supabase
        .from("drives")
        .select("id, sunset_time")
        .eq("drive_date", today)
        .in("status", ["open", "in_progress"]);

      if (!drives) return;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const drive of drives) {
        if (!drive.sunset_time) continue;
        const [h, m] = drive.sunset_time.split(":").map(Number);
        const sunsetMinutes = h * 60 + m;
        const callMinutes =
          sunsetMinutes - aiConfig.auto_call_hours_before_sunset * 60;

        // Check if it's time to call (within 1-minute window)
        if (
          currentMinutes >= callMinutes &&
          currentMinutes < callMinutes + 1
        ) {
          const { data: unconfirmed } = await supabase
            .from("assignments")
            .select("volunteer_id")
            .eq("drive_id", drive.id)
            .eq("status", "assigned");

          if (unconfirmed && unconfirmed.length > 0) {
            cronLogger.info(
              { count: unconfirmed.length, driveId: drive.id },
              "Auto-calling unconfirmed volunteers",
            );
            await retell.batchCall(
              drive.id,
              unconfirmed.map((a) => a.volunteer_id),
            );
          }
        }
      }
    }, {
      schedule: { type: "crontab", value: "* * * * *" },
    }).catch((error) => {
      cronLogger.error({ err: error }, "AI call trigger error");
    });
  }).start();

  // Update sunset times - daily at 2 AM PKT (21:00 UTC previous day)
  new CronJob("0 21 * * *", () => {
    Sentry.withMonitor("sunset-time-update", async () => {
      cronLogger.info("Updating sunset times");
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { data: drives } = await supabase
        .from("drives")
        .select("id, drive_date, sunset_source")
        .gte("drive_date", today.toISOString().split("T")[0])
        .lte("drive_date", nextWeek.toISOString().split("T")[0])
        .neq("sunset_source", "manual");

      if (!drives) return;

      for (const drive of drives) {
        try {
          const [year, month, day] = drive.drive_date.split("-");
          const res = await fetch(
            `https://api.aladhan.com/v1/timings/${day}-${month}-${year}?latitude=24.8607&longitude=67.0011&method=1`,
          );
          const data = await res.json() as { data?: { timings?: { Sunset?: string } } };
          const sunset = data?.data?.timings?.Sunset;

          if (sunset) {
            await supabase
              .from("drives")
              .update({ sunset_time: sunset, sunset_source: "aladhan" })
              .eq("id", drive.id);
          }
        } catch {
          // Skip if Aladhan API fails
        }
      }
    }, {
      schedule: { type: "crontab", value: "0 21 * * *" },
    }).catch((error) => {
      cronLogger.error({ err: error }, "Sunset update error");
    });
  }).start();

  // Waitlist promotion - every 2 minutes
  new CronJob("*/2 * * * *", () => {
    Sentry.withMonitor("waitlist-promotion", async () => {
      const { data: config } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "assignment_rules")
        .single();

      const rules = config?.value as { waitlist_auto_fill?: boolean } | null;
      if (!rules?.waitlist_auto_fill) return;

      // Find drives with waitlisted volunteers
      const { data: waitlisted } = await supabase
        .from("assignments")
        .select("drive_id")
        .eq("status", "waitlisted");

      if (!waitlisted) return;

      const driveIds = [...new Set(waitlisted.map((w) => w.drive_id))];

      for (const driveId of driveIds) {
        // Check for open capacity
        const { data: driveDuties } = await supabase
          .from("drive_duties")
          .select("duty_id, calculated_capacity, manual_capacity_override, current_assigned")
          .eq("drive_id", driveId);

        const hasCapacity = driveDuties?.some((dd) => {
          const cap = dd.manual_capacity_override ?? dd.calculated_capacity;
          return dd.current_assigned < cap;
        });

        if (!hasCapacity) continue;

        // Get waitlisted volunteers in order
        const { data: waitlist } = await supabase
          .from("assignments")
          .select("id, volunteer_id")
          .eq("drive_id", driveId)
          .eq("status", "waitlisted")
          .order("waitlist_position");

        if (!waitlist) continue;

        for (const entry of waitlist) {
          // Atomically delete only if still waitlisted (prevents double-processing)
          const { data: deleted } = await supabase
            .from("assignments")
            .delete()
            .eq("id", entry.id)
            .eq("status", "waitlisted")
            .select("id");

          // If nothing was deleted, another cron run already promoted this entry
          if (!deleted || deleted.length === 0) continue;

          // Re-fetch capacity since previous iterations may have filled slots
          const { data: freshDuties } = await supabase
            .from("drive_duties")
            .select("duty_id, calculated_capacity, manual_capacity_override, current_assigned")
            .eq("drive_id", driveId);

          if (!freshDuties) continue;

          const { data: volunteer } = await supabase
            .from("volunteers")
            .select("gender")
            .eq("id", entry.volunteer_id)
            .single();

          if (!volunteer) continue;

          let assigned = false;
          for (const dd of freshDuties) {
            const cap = dd.manual_capacity_override ?? dd.calculated_capacity;
            if (dd.current_assigned >= cap) continue;

            const { error } = await supabase.from("assignments").insert({
              volunteer_id: entry.volunteer_id,
              drive_id: driveId,
              duty_id: dd.duty_id,
              status: "assigned",
              assigned_by: "waitlist_promotion",
            });
            if (!error) assigned = true;
            break;
          }

          // If no slot found, re-waitlist the volunteer
          if (!assigned) {
            await supabase.from("assignments").insert({
              volunteer_id: entry.volunteer_id,
              drive_id: driveId,
              duty_id: freshDuties[0]?.duty_id,
              status: "waitlisted",
              assigned_by: "waitlist_promotion",
              waitlist_position: entry.id, // preserve ordering hint
            });
          }
        }
      }
    }, {
      schedule: { type: "crontab", value: "*/2 * * * *" },
    }).catch((error) => {
      cronLogger.error({ err: error }, "Waitlist promotion error");
    });
  }).start();

  // Send scheduled WhatsApp messages - every minute
  new CronJob("* * * * *", () => {
    Sentry.withMonitor("scheduled-messages", async () => {
      if (whatsapp.getStatus() !== "connected") return;

      const { data: waConf } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "whatsapp")
        .single();
      if (!(waConf?.value as any)?.enabled) return;

      const now = new Date().toISOString();

      // Fetch pending messages
      const { data: pending } = await supabase
        .from("scheduled_messages")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_at", now)
        .order("scheduled_at")
        .limit(20);

      // Fetch failed messages eligible for retry (max 3 attempts, less than 24h old)
      const retryAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: retryable } = await supabase
        .from("scheduled_messages")
        .select("*")
        .eq("status", "failed")
        .lt("retry_count", 3)
        .gte("created_at", retryAfter)
        .order("scheduled_at")
        .limit(10);

      const messages = [...(pending || []), ...(retryable || [])];
      if (messages.length === 0) return;

      for (const msg of messages) {
        try {
          if (msg.group_jid) {
            // Send to group
            await whatsapp.sendGroupMessage(msg.group_jid, msg.message);
          } else if (msg.volunteer_id) {
            // Send to individual volunteer
            const { data: volunteer } = await supabase
              .from("volunteers")
              .select("phone, name")
              .eq("id", msg.volunteer_id)
              .single();

            if (!volunteer?.phone) {
              await supabase
                .from("scheduled_messages")
                .update({ status: "failed", error: "Volunteer phone not found", retry_count: 3 })
                .eq("id", msg.id);
              continue;
            }

            // Replace template variables if a drive is linked
            let text = msg.message;
            if (msg.drive_id) {
              const { data: drive } = await supabase
                .from("drives")
                .select("name, location_name, sunset_time")
                .eq("id", msg.drive_id)
                .single();

              const { data: assignment } = await supabase
                .from("assignments")
                .select("duties(name)")
                .eq("volunteer_id", msg.volunteer_id)
                .eq("drive_id", msg.drive_id)
                .limit(1)
                .single();

              text = text
                .replace(/{name}/g, volunteer.name || "")
                .replace(/{drive_name}/g, (drive as any)?.name || "")
                .replace(/{location}/g, (drive as any)?.location_name || "")
                .replace(/{sunset_time}/g, (drive as any)?.sunset_time || "")
                .replace(/{duty}/g, (assignment?.duties as any)?.name || "");
            } else {
              text = text.replace(/{name}/g, volunteer.name || "");
            }

            await whatsapp.sendMessage(volunteer.phone, text);

            // Log to communication_log
            await supabase.from("communication_log").insert({
              volunteer_id: msg.volunteer_id,
              drive_id: msg.drive_id,
              channel: "whatsapp",
              direction: "outbound",
              content: text,
              sent_at: new Date().toISOString(),
            });
          }

          // Mark as sent
          await supabase
            .from("scheduled_messages")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", msg.id);
        } catch (error: any) {
          cronLogger.error({ err: error, messageId: msg.id, retryCount: msg.retry_count }, "Failed to send scheduled message");
          await supabase
            .from("scheduled_messages")
            .update({
              status: "failed",
              error: error.message || "Send failed",
              retry_count: (msg.retry_count || 0) + 1,
            })
            .eq("id", msg.id);
        }
      }
    }, {
      schedule: { type: "crontab", value: "* * * * *" },
    }).catch((error) => {
      cronLogger.error({ err: error }, "Scheduled message send error");
    });
  }).start();

  // Auto-reminders for upcoming drives - every 30 minutes
  new CronJob("*/30 * * * *", async () => {
    try {
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
      if (!waConfig?.enabled || !waConfig?.auto_reminders_enabled) return;

      const template =
        waConfig.auto_reminder_template ||
        "Assalam o Alaikum {name}! Reminder: You are assigned to {duty} for {drive_name} at {location}. {days_remaining} day(s) remaining. Please confirm by replying YES.";

      const today = new Date().toISOString().split("T")[0];
      const { data: drives } = await supabase
        .from("drives")
        .select("id, name, drive_date, location_name, sunset_time")
        .gte("drive_date", today)
        .in("status", ["open", "in_progress"]);

      if (!drives || drives.length === 0) return;

      const now = new Date();

      for (const drive of drives) {
        const driveDate = new Date(drive.drive_date + "T00:00:00");
        const diffMs = driveDate.getTime() - new Date(today + "T00:00:00").getTime();
        const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

        // Determine the dedup window based on urgency
        // >1 day away: 1 reminder per day (24h window)
        // ≤1 day away: every 12 hours (12h window)
        const windowHours = daysRemaining > 1 ? 24 : 12;
        const windowStart = new Date(
          now.getTime() - windowHours * 60 * 60 * 1000,
        ).toISOString();

        // Get assigned/confirmed volunteers for this drive
        const { data: assignments } = await supabase
          .from("assignments")
          .select("volunteer_id, duty_id, volunteers(name, phone), duties(name)")
          .eq("drive_id", drive.id)
          .in("status", ["assigned", "confirmed"]);

        if (!assignments || assignments.length === 0) continue;

        // Check which volunteers already received an auto-reminder in this window
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

          const message = "[auto-reminder] " + template
            .replace(/{name}/g, volunteer.name || "")
            .replace(/{duty}/g, duty?.name || "")
            .replace(/{drive_name}/g, drive.name || "")
            .replace(/{location}/g, drive.location_name || "")
            .replace(/{sunset_time}/g, drive.sunset_time || "")
            .replace(/{days_remaining}/g, String(daysRemaining));

          try {
            await whatsapp.sendMessage(volunteer.phone, message);

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
              `[CRON] Auto-reminder failed for ${volunteer.phone}:`,
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error("[CRON] Auto-reminder error:", error);
    }
  }).start();

  // WhatsApp health check - every 5 minutes
  new CronJob("*/5 * * * *", () => {
    Sentry.withMonitor("whatsapp-health-check", async () => {
      if (whatsapp.getStatus() === "disconnected") {
        cronLogger.info("WhatsApp disconnected, attempting reconnect...");
        await whatsapp.autoReconnect();
      }
    }, {
      schedule: { type: "crontab", value: "*/5 * * * *" },
    }).catch(() => {
      // Will retry next cycle
    });
  }).start();

  // Drive status transitions - hourly
  new CronJob("0 * * * *", () => {
    Sentry.withMonitor("drive-status-transitions", async () => {
      const today = new Date().toISOString().split("T")[0];

      // Open -> In Progress (on drive day)
      await supabase
        .from("drives")
        .update({ status: "in_progress" })
        .eq("status", "open")
        .eq("drive_date", today);

      // In Progress -> Completed (next day)
      await supabase
        .from("drives")
        .update({ status: "completed" })
        .eq("status", "in_progress")
        .lt("drive_date", today);
    }, {
      schedule: { type: "crontab", value: "0 * * * *" },
    }).catch((error) => {
      cronLogger.error({ err: error }, "Drive status transition error");
    });
  }).start();

  cronLogger.info("All cron jobs scheduled");
}
