import { NextResponse } from "next/server";

// WhatsApp Cloud API does not support group management (listing groups,
// adding participants, or generating invite links).
export async function GET() {
  return NextResponse.json(
    { error: "Group management is not supported by the WhatsApp Cloud API" },
    { status: 410 },
  );
}
