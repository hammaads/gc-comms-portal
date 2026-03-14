import { NextResponse } from "next/server";

// WhatsApp Cloud API uses a permanent access token — there is no session to disconnect.
// Revoke the token via Meta Business Suite if needed.
export async function POST() {
  return NextResponse.json(
    { error: "Not applicable for Cloud API — revoke token via Meta Business Suite" },
    { status: 410 },
  );
}
