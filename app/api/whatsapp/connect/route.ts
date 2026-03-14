import { NextResponse } from "next/server";

// WhatsApp Cloud API is always connected via a permanent access token.
// There is no connect/QR flow — this endpoint is not applicable.
export async function POST() {
  return NextResponse.json(
    { error: "Not applicable for Cloud API — no connection setup required" },
    { status: 410 },
  );
}
