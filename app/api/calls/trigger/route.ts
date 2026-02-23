import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { driveId, volunteerIds } = await request.json();

  // Get AI calling config
  const { data: config } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "ai_calling")
    .single();

  const aiConfig = config?.value as {
    enabled: boolean;
    provider: string;
  } | null;

  if (!aiConfig?.enabled) {
    return NextResponse.json(
      { error: "AI calling is not enabled. Configure it in Settings > AI Calling." },
      { status: 400 },
    );
  }

  // Log call attempts to communication_log
  for (const volunteerId of volunteerIds) {
    await supabase.from("communication_log").insert({
      volunteer_id: volunteerId,
      drive_id: driveId,
      channel: "ai_call" as const,
      direction: "outbound",
      call_provider: aiConfig.provider,
      content: "AI call initiated",
    });
  }

  // In production, this would call the Railway service to initiate Retell calls
  // For now, log the intent
  const railwayUrl = process.env.RAILWAY_SERVICE_URL;
  if (railwayUrl) {
    try {
      await fetch(`${railwayUrl}/api/calls/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RAILWAY_API_SECRET}`,
        },
        body: JSON.stringify({ driveId, volunteerIds }),
      });
    } catch (err) {
      Sentry.captureException(err);
      // Railway service not available - calls logged but not initiated
    }
  }

  const triggeredBy = (auth.claims.email as string) || "admin";
  const posthog = getPostHogClient();
  posthog?.capture({
    distinctId: triggeredBy,
    event: "ai_calls_triggered",
    properties: {
      drive_id: driveId,
      volunteer_count: volunteerIds.length,
      provider: aiConfig.provider,
    },
  });

  return NextResponse.json({
    success: true,
    message: `Call requests created for ${volunteerIds.length} volunteers`,
  });
}
