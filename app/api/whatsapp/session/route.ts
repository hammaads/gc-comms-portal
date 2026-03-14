import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCloudToken } from "@/lib/whatsapp/cloud-client";

// Cloud API has no QR/session flow — we map token health to the shape the UI expects.
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
      phoneNumber: displayPhoneNumber,
      qr_code: null,
    });
  } catch {
    return NextResponse.json({
      status: "disconnected",
      phoneNumber: null,
      qr_code: null,
    });
  }
}
