import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoAssignVolunteer } from "@/lib/assignment/auto-assign";
import { normalizePhone } from "@/lib/utils";
import * as Sentry from "@sentry/nextjs";
import { getPostHogClient } from "@/lib/posthog-server";

type ExistingVolunteerPayload = {
  driveId?: string;
  mode?: "existing";
  volunteerId?: string;
};

type NewVolunteerPayload = {
  driveId?: string;
  mode?: "new";
  name?: string;
  phone?: string;
  gender?: "male" | "female";
  email?: string | null;
  organization?: string | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as
      | ExistingVolunteerPayload
      | NewVolunteerPayload;

    const driveId = body.driveId;
    if (!isNonEmptyString(driveId)) {
      return NextResponse.json(
        { error: "driveId is required" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    let volunteerId: string;
    let volunteerName = "";

    if (body.mode === "existing") {
      if (!isNonEmptyString(body.volunteerId)) {
        return NextResponse.json(
          { error: "volunteerId is required for existing mode" },
          { status: 400 },
        );
      }

      const { data: existingVolunteer, error: existingVolunteerError } =
        await admin
          .from("volunteers")
          .select("id, name")
          .eq("id", body.volunteerId)
          .maybeSingle();

      if (existingVolunteerError) {
        return NextResponse.json(
          { error: existingVolunteerError.message },
          { status: 400 },
        );
      }
      if (!existingVolunteer) {
        return NextResponse.json(
          { error: "Volunteer not found" },
          { status: 404 },
        );
      }

      volunteerId = existingVolunteer.id;
      volunteerName = existingVolunteer.name;
    } else if (body.mode === "new") {
      if (
        !isNonEmptyString(body.name) ||
        !isNonEmptyString(body.phone) ||
        (body.gender !== "male" && body.gender !== "female")
      ) {
        return NextResponse.json(
          { error: "name, phone, and gender are required for new mode" },
          { status: 400 },
        );
      }

      const normalizedPhone = normalizePhone(body.phone);
      const emailValue =
        typeof body.email === "string" ? body.email.trim() : "";
      const organizationValue =
        typeof body.organization === "string" ? body.organization.trim() : "";

      const { data: upsertedVolunteer, error: upsertVolunteerError } =
        await admin
          .from("volunteers")
          .upsert(
            {
              phone: normalizedPhone,
              name: body.name.trim(),
              gender: body.gender,
              email: emailValue || null,
              organization: organizationValue || null,
              source: "manual",
            },
            { onConflict: "phone" },
          )
          .select("id, name")
          .single();

      if (upsertVolunteerError || !upsertedVolunteer) {
        return NextResponse.json(
          {
            error:
              upsertVolunteerError?.message ||
              "Failed to create or update volunteer",
          },
          { status: 400 },
        );
      }

      volunteerId = upsertedVolunteer.id;
      volunteerName = upsertedVolunteer.name;
    } else {
      return NextResponse.json(
        { error: "mode must be either 'existing' or 'new'" },
        { status: 400 },
      );
    }

    const { data: existingAssignment, error: existingAssignmentError } =
      await admin
        .from("assignments")
        .select("id")
        .eq("drive_id", driveId)
        .eq("volunteer_id", volunteerId)
        .maybeSingle();

    if (existingAssignmentError) {
      return NextResponse.json(
        { error: existingAssignmentError.message },
        { status: 400 },
      );
    }
    if (existingAssignment) {
      return NextResponse.json(
        {
          error: "Volunteer is already registered for this drive",
          code: "ALREADY_REGISTERED",
        },
        { status: 409 },
      );
    }

    const { error: availabilityError } = await admin
      .from("volunteer_availability")
      .upsert(
        {
          volunteer_id: volunteerId,
          drive_id: driveId,
          source: "manual",
        },
        { onConflict: "volunteer_id,drive_id" },
      );

    if (availabilityError) {
      return NextResponse.json(
        { error: availabilityError.message },
        { status: 400 },
      );
    }

    const assignedBy = (auth.claims.email as string) || "admin";
    const assignment = await autoAssignVolunteer(
      admin,
      volunteerId,
      driveId,
      assignedBy,
    );

    const posthog = getPostHogClient();
    posthog?.capture({
      distinctId: assignedBy,
      event: "manual_assignment_completed",
      properties: {
        drive_id: driveId,
        volunteer_id: volunteerId,
        mode: body.mode,
        assignment_status: assignment?.status ?? null,
        duty_name: assignment?.dutyName ?? null,
      },
    });

    return NextResponse.json({
      volunteerId,
      volunteerName,
      assignment,
      message: assignment
        ? assignment.status === "waitlisted"
          ? `${volunteerName} added and marked as unassigned`
          : `${volunteerName} added and assigned to ${assignment.dutyName}`
        : `${volunteerName} added to the drive`,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to register volunteer for this drive",
      },
      { status: 500 },
    );
  }
}
