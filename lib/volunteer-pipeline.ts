import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";
import { autoAssignVolunteer } from "@/lib/assignment/auto-assign";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface UpsertVolunteerInput {
  phone: string;
  name: string;
  email?: string | null;
  gender: "male" | "female";
  organization?: string | null;
  source: "in_app_form" | "luma" | "google_form" | "manual" | "bulk_import";
}

export interface UpsertVolunteerResult {
  volunteerId: string;
  isReturning: boolean;
}

/**
 * Finds an existing volunteer by normalized phone or creates a new one.
 * Updates name/email/org if the volunteer already exists.
 */
export async function upsertVolunteer(
  supabase: AdminClient,
  input: UpsertVolunteerInput,
): Promise<UpsertVolunteerResult> {
  const normalizedPhone = normalizePhone(input.phone);

  // Check for existing volunteer by phone
  const { data: existing } = await supabase
    .from("volunteers")
    .select("id")
    .eq("phone", normalizedPhone)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update fields that may have changed
    await supabase
      .from("volunteers")
      .update({
        name: input.name.trim(),
        ...(input.email ? { email: input.email.trim() } : {}),
        ...(input.organization ? { organization: input.organization.trim() } : {}),
      })
      .eq("id", existing.id);

    return { volunteerId: existing.id, isReturning: true };
  }

  const { data: volunteerRow, error } = await supabase
    .from("volunteers")
    .insert({
      phone: normalizedPhone,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      gender: input.gender,
      organization: input.organization?.trim() || null,
      source: input.source,
    })
    .select("id")
    .single();

  if (error || !volunteerRow) {
    throw new Error(error?.message || "Failed to create volunteer");
  }

  return { volunteerId: volunteerRow.id, isReturning: false };
}

export interface ProcessRegistrationInput {
  volunteerId: string;
  driveIds: string[];
  source: "in_app_form" | "luma" | "google_form" | "manual" | "bulk_import";
  lumaGuestId?: string;
}

export interface AssignmentInfo {
  drive: string;
  duty: string;
}

/**
 * Creates volunteer_availability records and runs auto-assignment for each drive.
 * Returns the resulting assignment info for messaging.
 */
export async function processRegistration(
  supabase: AdminClient,
  input: ProcessRegistrationInput,
): Promise<AssignmentInfo[]> {
  const assignments: AssignmentInfo[] = [];

  for (const driveId of input.driveIds) {
    const { error: availError } = await supabase
      .from("volunteer_availability")
      .insert({
        volunteer_id: input.volunteerId,
        drive_id: driveId,
        source: input.source,
        luma_guest_id: input.lumaGuestId || null,
      });

    // If luma_guest_id unique constraint violated, skip (idempotency)
    if (availError?.code === "23505" && input.lumaGuestId) {
      continue;
    }

    const result = await autoAssignVolunteer(
      supabase,
      input.volunteerId,
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

  return assignments;
}

/**
 * Queues a WhatsApp welcome DM (and group add) for a newly registered volunteer.
 * Should be called inside an `after()` callback so it runs after response is sent.
 */
export async function queueWhatsAppWelcome(
  supabase: AdminClient,
  volunteerId: string,
  phone: string,
  name: string,
  assignments: AssignmentInfo[],
): Promise<void> {
  const { data: config } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "whatsapp")
    .single();

  const whatsappConfig = config?.value as Record<string, unknown> | null;
  if (!whatsappConfig?.enabled) return;
  const groupJid = whatsappConfig?.volunteer_group_jid as string | undefined;

  // 1. Try to add to group via Railway — returns invite link if add fails
  const railwayUrl = process.env.RAILWAY_SERVICE_URL;
  const railwaySecret = process.env.RAILWAY_API_SECRET;
  let groupLink = "";
  let groupStatus: string | null = null;
  if (railwayUrl && railwaySecret && groupJid) {
    try {
      const res = await fetch(`${railwayUrl}/api/whatsapp/group/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${railwaySecret}`,
        },
        body: JSON.stringify({ phone, groupJid }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      groupLink = (data.link as string) || "";

      if (data.status === "added" || data.status === "already_in_group") {
        groupStatus = "added";
      } else if (groupLink) {
        groupStatus = "invite_sent";
      } else {
        groupStatus = "failed";
      }
    } catch (err) {
      console.error("[volunteer-pipeline] Group add failed:", err);
      groupStatus = "failed";
    }

    // Persist group-add result
    await supabase
      .from("volunteers")
      .update({ whatsapp_group_status: groupStatus })
      .eq("id", volunteerId);
  }

  // 2. Queue welcome DM using configured template
  const template = whatsappConfig?.welcome_dm_template as string | undefined;
  if (!template) return; // No template configured — skip sending

  const dutyLines =
    assignments.length > 0
      ? assignments.map((a) => `\u2022 ${a.drive}: ${a.duty}`).join("\n")
      : "";

  const message = template
    .replace(/{name}/g, name)
    .replace(/{assignments}/g, dutyLines);

  const now = new Date().toISOString();

  await supabase.from("scheduled_messages").insert({
    volunteer_id: volunteerId,
    channel: "whatsapp",
    message,
    scheduled_at: now,
    status: "pending",
  });

  // 3. If volunteer wasn't added to the group, send invite link as a separate message
  if (groupLink) {
    await supabase.from("scheduled_messages").insert({
      volunteer_id: volunteerId,
      channel: "whatsapp",
      message: groupLink,
      scheduled_at: now,
      status: "pending",
    });
  }
}
