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

  return await Sentry.withMonitor("scheduled-messages", async () => {
    const { data: waConf } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "whatsapp")
      .single();
    if (!(waConf?.value as any)?.enabled) {
      return NextResponse.json({ skipped: true, reason: "whatsapp disabled" });
    }

    const now = new Date().toISOString();

    // Fetch pending messages due now
    const { data: pending } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at")
      .limit(20);

    // Fetch failed messages eligible for retry (max 3 attempts, less than 24h old)
    const retryAfter = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: retryable } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "failed")
      .lt("retry_count", 3)
      .gte("created_at", retryAfter)
      .order("scheduled_at")
      .limit(10);

    // Recover stale "sending" messages stuck >5 min (crashed process)
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from("scheduled_messages")
      .update({ status: "failed" })
      .eq("status", "sending")
      .lt("sent_at", staleThreshold);

    const messages = [...(pending || []), ...(retryable || [])];
    if (messages.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;

    for (const msg of messages) {
      // Atomically claim the message
      const prevStatus = msg.status;
      const { data: claimed } = await supabase
        .from("scheduled_messages")
        .update({ status: "sending", sent_at: new Date().toISOString() })
        .eq("id", msg.id)
        .eq("status", prevStatus)
        .select("id");

      if (!claimed || claimed.length === 0) continue;

      try {
        if (msg.group_jid) {
          // Group messaging is not supported by Cloud API
          console.warn(
            `[cron/scheduled-messages] Skipping group message ${msg.id} — group_jid not supported by Cloud API`,
          );
          await supabase
            .from("scheduled_messages")
            .update({
              status: "failed",
              error: "group_jid not supported by Cloud API",
              retry_count: 3, // Prevent infinite retries
            })
            .eq("id", msg.id);
          continue;
        }

        if (msg.volunteer_id) {
          const { data: volunteer } = await supabase
            .from("volunteers")
            .select("phone, name")
            .eq("id", msg.volunteer_id)
            .single();

          if (!volunteer?.phone) {
            await supabase
              .from("scheduled_messages")
              .update({
                status: "failed",
                error: "Volunteer phone not found",
                retry_count: 3,
              })
              .eq("id", msg.id);
            continue;
          }

          // Replace template variables
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

          await sendWhatsAppMessage(volunteer.phone, text);

          await supabase.from("communication_log").insert({
            volunteer_id: msg.volunteer_id,
            drive_id: msg.drive_id,
            channel: "whatsapp",
            direction: "outbound",
            content: text,
            sent_at: new Date().toISOString(),
          });
        }

        await supabase
          .from("scheduled_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", msg.id);

        processed++;
      } catch (error: any) {
        console.error(
          `[cron/scheduled-messages] Failed to send message ${msg.id}:`,
          error,
        );
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

    return NextResponse.json({ processed });
  });
}
