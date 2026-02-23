import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  batchAutoAssign,
  promoteWaitlist,
} from "@/lib/assignment/auto-assign";
import * as Sentry from "@sentry/nextjs";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { driveId?: string };
  try {
    body = await request.json();
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const { driveId } = body;
  if (!driveId) {
    return NextResponse.json({ error: "driveId required" }, { status: 400 });
  }

  const assignedBy = (data.claims.email as string) || "admin";

  // 1) Assign volunteers who are available for this drive but have no assignment yet
  const batchResults = await batchAutoAssign(
    supabase as any,
    driveId,
    assignedBy,
  );

  // 2) Promote waitlisted (Unassigned) into duties where there is capacity
  const promotedResults = await promoteWaitlist(supabase as any, driveId);

  const results = [...batchResults, ...promotedResults];

  const posthog = getPostHogClient();
  posthog?.capture({
    distinctId: assignedBy,
    event: "batch_auto_assign_completed",
    properties: {
      drive_id: driveId,
      total_assigned: results.length,
      newly_assigned: batchResults.length,
      promoted_from_waitlist: promotedResults.length,
    },
  });

  return NextResponse.json({ count: results.length, results });
}
