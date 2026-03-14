import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCloudToken } from "@/lib/whatsapp/cloud-client";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { displayPhoneNumber } = await validateCloudToken();
    return NextResponse.json({
      status: "connected",
      whatsapp: "connected",
      phoneNumber: displayPhoneNumber,
    });
  } catch (err: any) {
    Sentry.captureException(err);
    return NextResponse.json(
      { status: "error", whatsapp: "disconnected", error: err.message },
      { status: 502 },
    );
  }
}
