import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp/cloud-client";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone, message } = await request.json();
  if (!phone || !message) {
    return NextResponse.json(
      { error: "Phone and message are required" },
      { status: 400 },
    );
  }

  try {
    await sendWhatsAppMessage(phone, message);
    return NextResponse.json({ status: "sent" });
  } catch (err: any) {
    Sentry.captureException(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
