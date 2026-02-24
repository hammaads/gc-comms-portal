import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";
import {
  upsertVolunteer,
  processRegistration,
  queueWhatsAppWelcome,
} from "@/lib/volunteer-pipeline";
import {
  createDriveDuties,
  createDefaultReminders,
  fetchSunsetTime,
} from "@/app/(dashboard)/drives/actions";
import type {
  LumaEvent,
  LumaGuest,
  LumaWebhookEventPayload,
  LumaWebhookGuestPayload,
  LumaRegistrationAnswer,
} from "@/lib/luma";

function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: NextRequest) {
  // Verify webhook token (timing-safe)
  const token = request.nextUrl.searchParams.get("token");
  const secret = process.env.LUMA_WEBHOOK_SECRET;
  if (!token || !secret || !safeTokenCompare(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Accept both wrapped ({ type, data }) and direct payloads.
    const root = isRecord(body) ? body : {};
    const data = isRecord(root.data) ? root.data : root;
    const webhookType = typeof root.type === "string"
      ? root.type
      : typeof root.event_type === "string"
        ? root.event_type
        : undefined;

    const hasGuest = Boolean(data.guest);
    const normalizedEvent = extractEvent(data);
    const hasEvent = Boolean(normalizedEvent);
    const hasHosts = Array.isArray(data.hosts);

    console.log(
      "[luma-webhook] parsed payload:",
      JSON.stringify({
        webhookType: webhookType ?? null,
        rootKeys: Object.keys(root),
        dataKeys: Object.keys(data),
        hasGuest,
        hasEvent,
        hasHosts,
      }),
    );

    const isGuestPayload = webhookType === "guest.registered" || (hasGuest && hasEvent);
    const isEventPayload = (
      webhookType === "event.created" ||
      webhookType === "event.updated" ||
      webhookType === "calendar.event.created" ||
      webhookType === "calendar.event.updated" ||
      (hasEvent && !hasGuest)
    );

    if (isGuestPayload) {
      return handleGuestRegistered(supabase, data as unknown as LumaWebhookGuestPayload);
    }

    if (isEventPayload) {
      return handleEventCreatedOrUpdated(supabase, data as unknown as LumaWebhookEventPayload);
    }

    // Acknowledge unknown webhooks to avoid retry storms while we inspect logs.
    console.warn(
      "[luma-webhook] Ignoring unknown webhook payload",
      JSON.stringify({
        webhookType: webhookType ?? null,
        rootKeys: Object.keys(root),
        dataKeys: Object.keys(data),
      }),
    );
    return NextResponse.json({ action: "ignored", reason: "unknown_webhook_type" });
  } catch (err) {
    console.error("[luma-webhook]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}

// --- event.created / event.updated ---

async function handleEventCreatedOrUpdated(
  supabase: ReturnType<typeof createAdminClient>,
  payload: LumaWebhookEventPayload,
) {
  const lumaEvent = extractEvent(payload);
  if (!lumaEvent) {
    return NextResponse.json(
      { error: "Invalid event payload shape" },
      { status: 422 },
    );
  }

  // Get active season
  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!season) {
    return NextResponse.json(
      { error: "No active season found" },
      { status: 422 },
    );
  }

  // Parse date from event start_at
  const startAt = new Date(lumaEvent.start_at);
  const driveDate = startAt.toISOString().split("T")[0];

  // Parse location
  const lat = lumaEvent.geo_latitude ? parseFloat(lumaEvent.geo_latitude) : null;
  const lng = lumaEvent.geo_longitude ? parseFloat(lumaEvent.geo_longitude) : null;
  const addressJson = lumaEvent.geo_address_json as Record<string, unknown> | null;
  const locationAddress = addressJson?.full_address as string
    || addressJson?.address as string
    || null;

  // Get default daig count from config
  const { data: daigConfig } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "default_daig_count")
    .single();
  const defaultDaigCount = daigConfig?.value ? Number(daigConfig.value) : 5;

  // Fetch sunset time
  const sunsetTime = await fetchSunsetTime(driveDate);

  // Check if drive already exists for this Luma event
  const { data: existingDrive } = await supabase
    .from("drives")
    .select("id")
    .eq("luma_event_id", lumaEvent.id)
    .maybeSingle();

  if (existingDrive) {
    // Update existing drive
    await supabase
      .from("drives")
      .update({
        name: lumaEvent.name,
        drive_date: driveDate,
        location_name: lumaEvent.name,
        location_address: locationAddress,
        location_lat: lat,
        location_lng: lng,
        sunset_time: sunsetTime,
        sunset_source: sunsetTime ? "aladhan" : null,
      })
      .eq("id", existingDrive.id);

    return NextResponse.json({ action: "updated", driveId: existingDrive.id });
  }

  // Create new drive
  const { data: drive, error: driveError } = await supabase
    .from("drives")
    .insert({
      season_id: season.id,
      name: lumaEvent.name,
      drive_date: driveDate,
      location_name: lumaEvent.name,
      location_address: locationAddress,
      location_lat: lat,
      location_lng: lng,
      daig_count: defaultDaigCount,
      sunset_time: sunsetTime,
      sunset_source: sunsetTime ? "aladhan" : null,
      status: "open" as const,
      luma_event_id: lumaEvent.id,
    })
    .select("id")
    .single();

  if (driveError?.code === "23505") {
    // Concurrent webhook delivery may have inserted the same luma_event_id.
    // Retry finding the drive with a short delay to allow the other transaction to complete.
    await new Promise(resolve => setTimeout(resolve, 100));
    const existing = await findDriveByLumaEvent(supabase, lumaEvent.id);
    if (existing) {
      await supabase
        .from("drives")
        .update({
          name: lumaEvent.name,
          drive_date: driveDate,
          location_name: lumaEvent.name,
          location_address: locationAddress,
          location_lat: lat,
          location_lng: lng,
          sunset_time: sunsetTime,
          sunset_source: sunsetTime ? "aladhan" : null,
        })
        .eq("id", existing.id);
      return NextResponse.json({ action: "updated", driveId: existing.id });
    }
    // If still not found after retry, let the error handler below deal with it
  }

  if (driveError || !drive) {
    return NextResponse.json(
      { error: driveError?.message || "Failed to create drive" },
      { status: 500 },
    );
  }

  // Create drive duties and reminders
  await createDriveDuties(supabase, drive.id, defaultDaigCount);
  await createDefaultReminders(supabase, drive.id, driveDate, sunsetTime);

  return NextResponse.json({ action: "created", driveId: drive.id });
}

// --- guest.registered ---

async function handleGuestRegistered(
  supabase: ReturnType<typeof createAdminClient>,
  payload: LumaWebhookGuestPayload,
) {
  const normalized = extractGuestRegistration(payload);
  if (!normalized) {
    return NextResponse.json(
      { error: "Invalid guest registration payload shape" },
      { status: 422 },
    );
  }
  const { guest, event: lumaEvent } = normalized;

  // Find drive by luma_event_id
  let drive = await findDriveByLumaEvent(supabase, lumaEvent.id);

  // If drive doesn't exist yet, create it on-demand
  if (!drive) {
    const { data: season } = await supabase
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!season) {
      return NextResponse.json(
        { error: "No active season found" },
        { status: 422 },
      );
    }

    const driveDate = new Date(lumaEvent.start_at).toISOString().split("T")[0];
    const { data: daigConfig } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "default_daig_count")
      .single();
    const defaultDaigCount = daigConfig?.value ? Number(daigConfig.value) : 5;
    const sunsetTime = await fetchSunsetTime(driveDate);

    const { data: newDrive, error: driveError } = await supabase
      .from("drives")
      .insert({
        season_id: season.id,
        name: lumaEvent.name,
        drive_date: driveDate,
        daig_count: defaultDaigCount,
        sunset_time: sunsetTime,
        sunset_source: sunsetTime ? "aladhan" : null,
        status: "open" as const,
        luma_event_id: lumaEvent.id,
      })
      .select("id")
      .single();

    if (driveError?.code === "23505") {
      // Retry finding the drive with a short delay to allow the other transaction to complete.
      await new Promise(resolve => setTimeout(resolve, 100));
      const existing = await findDriveByLumaEvent(supabase, lumaEvent.id);
      if (existing) {
        drive = existing;
      } else {
        // If still not found after retry, return error
        return NextResponse.json(
          { error: "Failed to resolve concurrent drive insertion" },
          { status: 500 },
        );
      }
    } else if (driveError || !newDrive) {
      return NextResponse.json(
        { error: driveError?.message || "Failed to create drive" },
        { status: 500 },
      );
    } else {
      await createDriveDuties(supabase, newDrive.id, defaultDaigCount);
      await createDefaultReminders(supabase, newDrive.id, driveDate, sunsetTime);
      drive = newDrive;
    }
  }

  if (!drive) {
    return NextResponse.json(
      { error: "Failed to resolve drive for event" },
      { status: 500 },
    );
  }

  // Idempotency: check if this guest was already processed
  const { data: existingAvailability } = await supabase
    .from("volunteer_availability")
    .select("id")
    .eq("luma_guest_id", guest.id)
    .maybeSingle();

  if (existingAvailability) {
    return NextResponse.json({ action: "skipped", reason: "already_processed" });
  }

  // Extract guest data
  const name = guest.user_name
    || [guest.user_first_name, guest.user_last_name].filter(Boolean).join(" ")
    || "Unknown";
  const email = guest.user_email || null;
  const answers = guest.registration_answers || [];

  const phone = guest.phone_number || getAnswerValue(answers, "phone") || null;
  const gender = (getAnswerValue(answers, "gender")?.toLowerCase() as "male" | "female") || "male";
  const organization = getAnswerValue(answers, "organization")
    || getAnswerValue(answers, "company")
    || getAnswerValue(answers, "school")
    || null;

  // Normalize phone if available
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  if (!normalizedPhone) {
    // Can't process without phone — phone is required for volunteer identity
    console.warn("[luma-webhook] Guest has no phone number, skipping:", guest.id);
    return NextResponse.json({ action: "skipped", reason: "no_phone", guestId: guest.id });
  }

  const { volunteerId } = await upsertVolunteer(supabase, {
    phone: normalizedPhone,
    name,
    email,
    gender,
    organization,
    source: "luma",
  });

  const assignments = await processRegistration(supabase, {
    volunteerId,
    driveIds: [drive.id],
    source: "luma",
    lumaGuestId: guest.id,
  });

  // Queue WhatsApp welcome after response
  after(async () => {
    try {
      await queueWhatsAppWelcome(supabase, volunteerId, normalizedPhone, name, assignments);
    } catch (err) {
      console.error("[luma-webhook] WhatsApp welcome queue failed:", err);
    }
  });

  return NextResponse.json({ action: "registered", volunteerId, whatsapp: true });
}

// --- Helpers ---

async function findDriveByLumaEvent(
  supabase: ReturnType<typeof createAdminClient>,
  lumaEventId: string,
) {
  const { data } = await supabase
    .from("drives")
    .select("id")
    .eq("luma_event_id", lumaEventId)
    .maybeSingle();
  return data;
}

function getAnswerValue(
  answers: LumaRegistrationAnswer[],
  labelPattern: string,
): string | null {
  const answer = answers.find((a) =>
    a.label.toLowerCase().includes(labelPattern.toLowerCase()),
  );
  if (!answer) return null;
  const val = answer.value ?? answer.answer;
  return typeof val === "string" ? val : null;
}

function extractEvent(payload: unknown): LumaEvent | null {
  if (!isRecord(payload)) return null;

  const candidate = isRecord(payload.event)
    ? payload.event
    : payload;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.start_at !== "string" ||
    typeof candidate.name !== "string"
  ) {
    return null;
  }

  return candidate as unknown as LumaEvent;
}

function extractGuestRegistration(
  payload: unknown,
): { guest: LumaGuest; event: LumaEvent } | null {
  if (!isRecord(payload)) return null;

  const guestCandidate = isRecord(payload.guest)
    ? payload.guest
    : payload;

  const eventCandidate = isRecord(payload.event)
    ? payload.event
    : isRecord(guestCandidate.event)
      ? guestCandidate.event
      : null;

  if (
    !eventCandidate ||
    typeof eventCandidate.id !== "string" ||
    typeof eventCandidate.start_at !== "string" ||
    typeof eventCandidate.name !== "string" ||
    typeof guestCandidate.id !== "string"
  ) {
    return null;
  }

  return {
    guest: guestCandidate as unknown as LumaGuest,
    event: eventCandidate as unknown as LumaEvent,
  };
}
