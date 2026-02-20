import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";
import { autoAssignVolunteer } from "@/lib/assignment/auto-assign";
import * as Sentry from "@sentry/nextjs";
import { rateLimit } from "@/lib/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";
import { sendPushNotificationToAll } from "@/lib/push";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, 10, 60_000);
  if (limited) return limited;

  try {
    const body = await request.json();
    const {
      phone,
      name,
      email,
      gender,
      organization,
      driveIds,
    } = body as {
      phone?: string;
      name?: string;
      email?: string | null;
      gender?: "male" | "female";
      organization?: string | null;
      driveIds?: string[];
    };

    const emailTrimmed = typeof email === "string" ? email.trim() : "";
    const organizationTrimmed =
      typeof organization === "string" ? organization.trim() : "";

    if (
      !phone ||
      !name ||
      !gender ||
      !emailTrimmed ||
      !organizationTrimmed ||
      !Array.isArray(driveIds) ||
      driveIds.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const normalizedPhone = normalizePhone(phone);

    const { data: volunteerRow, error: volError } = await supabase
      .from("volunteers")
      .upsert(
        {
          phone: normalizedPhone,
          name: name.trim(),
          email: emailTrimmed,
          gender,
          organization: organizationTrimmed,
          source: "in_app_form" as const,
        },
        { onConflict: "phone" },
      )
      .select("id")
      .single();

    if (volError || !volunteerRow) {
      return NextResponse.json(
        { error: volError?.message || "Failed to save volunteer" },
        { status: 400 },
      );
    }

    for (const driveId of driveIds) {
      await supabase
        .from("volunteer_availability")
        .insert({
          volunteer_id: volunteerRow.id,
          drive_id: driveId,
          source: "in_app_form" as const,
        });
    }

    const assignments: Array<{ drive: string; duty: string }> = [];

    for (const driveId of driveIds) {
      const result = await autoAssignVolunteer(
        supabase,
        volunteerRow.id,
        driveId,
      );

      if (result) {
        const { data: drive } = await supabase
          .from("drives")
          .select("name")
          .eq("id", driveId)
          .single();

        assignments.push({
          drive: drive?.name || driveId,
          duty:
            result.status === "waitlisted"
              ? `Waitlisted (${result.dutyName})`
              : result.dutyName,
        });
      }
    }

    // Queue WhatsApp welcome DM + push notification (runs after response is sent)
    after(async () => {
      try {
        await queueWhatsAppWelcome(supabase, volunteerRow.id, normalizedPhone, name.trim(), assignments);
      } catch (err) {
        console.error("[volunteer-register] WhatsApp welcome queue failed:", err);
      }

      try {
        const driveNames = assignments.map((a) => a.drive).join(", ");
        await sendPushNotificationToAll({
          title: "New Volunteer Signup",
          body: `${name.trim()} signed up for ${driveNames}`,
          url: "/volunteers",
        });
      } catch (err) {
        console.error("[volunteer-register] Push notification failed:", err);
      }
    });

    const posthog = getPostHogClient();
    posthog?.capture({
      distinctId: volunteerRow.id,
      event: "public_volunteer_registered",
      properties: {
        gender,
        drive_count: driveIds.length,
        assignments_count: assignments.length,
        source: "in_app_form",
        $set: {
          gender,
          organization: organizationTrimmed || null,
          source: "in_app_form",
        },
        $set_once: {
          first_registration_date: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      volunteerId: volunteerRow.id,
      assignments,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[volunteer-register]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to register volunteer",
      },
      { status: 500 },
    );
  }
}

async function queueWhatsAppWelcome(
  supabase: ReturnType<typeof createAdminClient>,
  volunteerId: string,
  phone: string,
  name: string,
  assignments: Array<{ drive: string; duty: string }>,
) {
  const { data: config } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "whatsapp")
    .single();

  const whatsappConfig = config?.value as any;
  if (!whatsappConfig?.enabled) return;
  const groupJid = whatsappConfig?.volunteer_group_jid;

  // 1. Try to add to group via Railway — returns invite link if add fails
  const railwayUrl = process.env.RAILWAY_SERVICE_URL;
  const railwaySecret = process.env.RAILWAY_API_SECRET;
  let groupLink = "";
  if (railwayUrl && railwaySecret && groupJid) {
    try {
      const res = await fetch(`${railwayUrl}/api/whatsapp/group/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${railwaySecret}`,
        },
        body: JSON.stringify({ phone, groupJid, name, assignments, welcomeTemplate: "__skip_dm__" }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({}));
      groupLink = data.link || "";
    } catch (err) {
      console.error("[volunteer-register] Group add failed:", err);
    }
  }

  // 2. Queue single welcome DM (includes invite link if group-add failed)
  const dutyLines = assignments.length > 0
    ? assignments.map((a) => `• ${a.drive}: ${a.duty}`).join("\n")
    : "";

  const template = whatsappConfig?.welcome_dm_template || "";
  const defaultMsg = groupLink
    ? `Assalamu Alaikum!\n\nJazakAllah Khair for signing up as a volunteer for Grand Citizens Iftaar Drive.\n\nPlease join our volunteer group:\n${groupLink}`
    : `Assalamu Alaikum!\n\nJazakAllah Khair for signing up as a volunteer for Grand Citizens Iftaar Drive. You have been added to the volunteer group.`;
  const message = template
    ? template
        .replace(/{name}/g, name)
        .replace(/{assignments}/g, dutyLines)
        .replace(/{group_link}/g, groupLink)
    : defaultMsg;

  await supabase.from("scheduled_messages").insert({
    volunteer_id: volunteerId,
    channel: "whatsapp",
    message,
    scheduled_at: new Date().toISOString(),
    status: "pending",
  });
}

