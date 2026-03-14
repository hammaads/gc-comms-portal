const GRAPH_BASE = "https://graph.facebook.com/v23.0";

/**
 * Send a text message to a phone number via WhatsApp Cloud API v23.
 * Phone can be in E.164 format with or without the leading +.
 */
export async function sendWhatsAppMessage(
  phone: string,
  text: string,
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_CLOUD_ACCESS_TOKEN must be set",
    );
  }

  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/^\+/, ""),
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp Cloud API error ${res.status}: ${err}`);
  }
}

export interface CloudIncomingMessage {
  /** Unique message ID — use for deduplication */
  id: string;
  /** Sender phone number in E.164 format WITHOUT leading + */
  from: string;
  /** Plain text body */
  text: string;
}

/**
 * Extract text messages from a Cloud API webhook payload.
 * Returns an empty array for status update events or non-text messages.
 */
export function parseIncomingMessages(body: unknown): CloudIncomingMessage[] {
  const messages: CloudIncomingMessage[] = [];

  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray((body as any).entry)
  ) {
    return messages;
  }

  for (const entry of (body as any).entry) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== "messages") continue;
      const msgs = change?.value?.messages;
      if (!Array.isArray(msgs)) continue;
      for (const msg of msgs) {
        if (msg?.type !== "text") continue;
        const text = msg?.text?.body;
        if (!text || typeof text !== "string") continue;
        messages.push({
          id: msg.id,
          from: String(msg.from),
          text,
        });
      }
    }
  }

  return messages;
}

/**
 * Validate the Cloud API access token by fetching the phone number details.
 * Returns the display phone number on success, throws on failure.
 */
export async function validateCloudToken(): Promise<{
  phoneNumberId: string;
  displayPhoneNumber: string;
}> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_CLOUD_ACCESS_TOKEN must be set",
    );
  }

  const res = await fetch(
    `${GRAPH_BASE}/${phoneNumberId}?fields=id,display_phone_number`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloud API token validation failed ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    id: string;
    display_phone_number: string;
  };

  return {
    phoneNumberId: data.id,
    displayPhoneNumber: data.display_phone_number,
  };
}
