const LUMA_BASE_URL = "https://public-api.luma.com";

function getHeaders(): HeadersInit {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) throw new Error("LUMA_API_KEY is not set");
  return {
    "x-luma-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

// --- Types ---

export interface LumaEvent {
  id: string;
  user_id: string;
  calendar_id: string;
  start_at: string;
  duration_interval: string;
  end_at: string;
  created_at: string;
  timezone: string;
  name: string;
  description: string;
  description_md: string;
  geo_address_json: Record<string, unknown> | null;
  geo_latitude: string | null;
  geo_longitude: string | null;
  meeting_url: string | null;
  cover_url: string;
  url: string;
  visibility: "public" | "members-only" | "private";
  registration_questions: LumaRegistrationQuestion[];
}

export interface LumaRegistrationQuestion {
  id: string;
  label: string;
  question_type: string;
  required: boolean;
  options?: string[];
  terms?: { content_type: string; content_md: string; collect_signature: boolean };
}

export interface LumaRegistrationAnswer {
  label: string;
  question_id: string;
  value: unknown;
  answer: unknown;
  question_type: string;
}

export interface LumaGuest {
  id: string;
  api_id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  name: string | null;
  email: string;
  approval_status: string;
  phone_number: string | null;
  registered_at: string | null;
  created_at: string;
  checked_in_at: string | null;
  registration_answers: LumaRegistrationAnswer[] | null;
}

export interface LumaHost {
  id: string;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string;
}

export interface LumaWebhookEventPayload {
  event: LumaEvent;
  hosts: LumaHost[];
}

export interface LumaWebhookGuestPayload {
  guest: LumaGuest;
  event: {
    id: string;
    name: string;
    start_at: string;
    end_at: string;
  };
}

// --- API Functions ---

export async function getLumaEvent(
  eventId: string,
): Promise<{ event: LumaEvent; hosts: LumaHost[] }> {
  const res = await fetch(
    `${LUMA_BASE_URL}/v1/event/get?id=${encodeURIComponent(eventId)}`,
    { headers: getHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Luma API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function getLumaGuest(
  eventId: string,
  guestId: string,
): Promise<{ guest: LumaGuest }> {
  const params = new URLSearchParams({
    event_id: eventId,
    id: guestId,
  });
  const res = await fetch(
    `${LUMA_BASE_URL}/v1/event/get-guest?${params}`,
    { headers: getHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Luma API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
