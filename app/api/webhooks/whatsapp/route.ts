import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseIncomingMessages,
  sendWhatsAppMessage,
} from "@/lib/whatsapp/cloud-client";
import * as Sentry from "@sentry/nextjs";

// ── Webhook verification (Meta GET challenge) ──────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ── Incoming messages ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Read raw body for HMAC verification
  const rawBody = await request.arrayBuffer();
  const rawBodyBuffer = Buffer.from(rawBody);

  // 2. Verify X-Hub-Signature-256
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 403 });
    }
    const expected =
      "sha256=" +
      createHmac("sha256", appSecret).update(rawBodyBuffer).digest("hex");
    try {
      const sigBuffer = Buffer.from(signature);
      const expBuffer = Buffer.from(expected);
      if (
        sigBuffer.length !== expBuffer.length ||
        !timingSafeEqual(sigBuffer, expBuffer)
      ) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  // 3. Parse payload
  let body: unknown;
  try {
    body = JSON.parse(rawBodyBuffer.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Always return 200 quickly — Meta retries on non-2xx responses
  // Process messages asynchronously after responding
  processMessages(body).catch((err) => Sentry.captureException(err));

  return NextResponse.json({ received: true });
}

// ── Message processing logic ───────────────────────────────────────────────

async function processMessages(body: unknown): Promise<void> {
  const messages = parseIncomingMessages(body);
  if (messages.length === 0) return;

  const supabase = createAdminClient();

  // Load WhatsApp config for keywords
  const { data: config } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "whatsapp")
    .single();

  const whatsappConfig = config?.value as {
    confirm_keywords: string[];
    cancel_keywords: string[];
  } | null;

  if (!whatsappConfig) {
    console.warn(
      "[whatsapp-webhook] No whatsapp config in app_config — cannot process messages",
    );
    return;
  }

  for (const msg of messages) {
    try {
      await processMessage(supabase, msg, whatsappConfig);
    } catch (err) {
      Sentry.captureException(err, {
        extra: { msgId: msg.id, from: msg.from },
      });
    }
  }
}

async function processMessage(
  supabase: ReturnType<typeof createAdminClient>,
  msg: { id: string; from: string; text: string },
  whatsappConfig: { confirm_keywords: string[]; cancel_keywords: string[] },
): Promise<void> {
  // Dedup: skip if we already logged this message ID
  const { data: existing } = await supabase
    .from("communication_log")
    .select("id")
    .eq("whatsapp_message_id", msg.id)
    .maybeSingle();

  if (existing) return;

  // Cloud API sends E.164 without leading + (e.g. "923001234567")
  const rawPhone = msg.from;
  const phoneWithPlus = "+" + rawPhone;

  // Look up volunteer by phone — try both formats
  let volunteer: { id: string } | null = null;
  const { data: v1 } = await supabase
    .from("volunteers")
    .select("id")
    .eq("phone", phoneWithPlus)
    .single();
  volunteer = v1;

  if (!volunteer) {
    const { data: v2 } = await supabase
      .from("volunteers")
      .select("id")
      .eq("phone", rawPhone)
      .single();
    volunteer = v2;
  }

  if (!volunteer) {
    console.warn(
      `[whatsapp-webhook] Incoming message from unknown phone: ${rawPhone}`,
    );
    return;
  }

  const text = msg.text;
  console.info(
    `[whatsapp-webhook] Processing message from volunteer ${volunteer.id}: "${text.substring(0, 80)}"`,
  );

  // Exact word matching (not substring)
  const words = text.toLowerCase().trim().split(/\s+/);
  const isConfirm = whatsappConfig.confirm_keywords?.some((k) =>
    words.includes(k.toLowerCase()),
  );
  const isCancel = whatsappConfig.cancel_keywords?.some((k) =>
    words.includes(k.toLowerCase()),
  );

  if (isConfirm) {
    // Confirm the next upcoming assigned drive
    const { data: nextAssignment } = await supabase
      .from("assignments")
      .select("id, drive_id, drives(drive_date)")
      .eq("volunteer_id", volunteer.id)
      .eq("status", "assigned")
      .order("drives(drive_date)", { ascending: true })
      .limit(1)
      .single();

    if (nextAssignment) {
      await supabase
        .from("assignments")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", nextAssignment.id);

      await supabase.from("communication_log").insert({
        volunteer_id: volunteer.id,
        drive_id: nextAssignment.drive_id,
        channel: "whatsapp",
        direction: "inbound",
        content: text,
        whatsapp_message_id: msg.id,
      });

      try {
        await sendWhatsAppMessage(
          phoneWithPlus,
          "Your attendance has been confirmed. JazakAllah Khair!",
        );
      } catch {
        // Non-critical — don't fail if reply doesn't send
      }

      console.info(
        `[whatsapp-webhook] Assignment ${nextAssignment.id} confirmed via WhatsApp`,
      );
    } else {
      console.warn(
        `[whatsapp-webhook] Confirm keyword but no assigned assignment for volunteer ${volunteer.id}`,
      );
    }
    return;
  }

  if (isCancel) {
    // Cancel the next upcoming assigned or confirmed drive
    const { data: nextAssignment } = await supabase
      .from("assignments")
      .select("id, drive_id, drives(drive_date)")
      .eq("volunteer_id", volunteer.id)
      .in("status", ["assigned", "confirmed"])
      .order("drives(drive_date)", { ascending: true })
      .limit(1)
      .single();

    if (nextAssignment) {
      await supabase
        .from("assignments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "WhatsApp cancel keyword",
        })
        .eq("id", nextAssignment.id);

      await supabase.from("communication_log").insert({
        volunteer_id: volunteer.id,
        drive_id: nextAssignment.drive_id,
        channel: "whatsapp",
        direction: "inbound",
        content: text,
        whatsapp_message_id: msg.id,
      });

      try {
        await sendWhatsAppMessage(
          phoneWithPlus,
          "Your assignment has been cancelled. If this was a mistake, please reply with 'confirm'.",
        );
      } catch {
        // Non-critical
      }

      console.info(
        `[whatsapp-webhook] Assignment ${nextAssignment.id} cancelled via WhatsApp`,
      );
    } else {
      console.warn(
        `[whatsapp-webhook] Cancel keyword but no active assignment for volunteer ${volunteer.id}`,
      );
    }
    return;
  }

  // No keyword match — log the inbound message
  await supabase.from("communication_log").insert({
    volunteer_id: volunteer.id,
    channel: "whatsapp",
    direction: "inbound",
    content: text,
    whatsapp_message_id: msg.id,
  });
}
