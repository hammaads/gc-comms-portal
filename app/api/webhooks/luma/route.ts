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
  LumaWebhookEventPayload,
  LumaWebhookGuestPayload,
  LumaRegistrationAnswer,
} from "@/lib/luma";

function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
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

    // Luma wraps webhook payloads in { type, data: { ... } }
    const webhookType = body.type as string | undefined;
    const data = body.data as Record<string, unknown> | undefined;

    if (webhookType === "guest.registered" && data?.guest) {
      return handleGuestRegistered(supabase, data as unknown as LumaWebhookGuestPayload);
    } else if (
      (webhookType === "event.created" || webhookType === "event.updated") &&
      data?.event
    ) {
      return handleEventCreatedOrUpdated(supabase, data as unknown as LumaWebhookEventPayload);
    }

    return NextResponse.json({ error: "Unknown webhook type" }, { status: 400 });
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
  const lumaEvent = payload.event;

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
  const { guest, event: lumaEvent } = payload;

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

    if (driveError || !newDrive) {
      return NextResponse.json(
        { error: driveError?.message || "Failed to create drive" },
        { status: 500 },
      );
    }

    await createDriveDuties(supabase, newDrive.id, defaultDaigCount);
    await createDefaultReminders(supabase, newDrive.id, driveDate, sunsetTime);
    drive = newDrive;
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
