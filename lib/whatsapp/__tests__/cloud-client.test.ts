import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendWhatsAppMessage,
  parseIncomingMessages,
  validateCloudToken,
} from "../cloud-client";

// ── Helpers ───────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

const ENV = {
  WHATSAPP_PHONE_NUMBER_ID: "12345678901",
  WHATSAPP_CLOUD_ACCESS_TOKEN: "test-token-abc",
};

beforeEach(() => {
  Object.assign(process.env, ENV);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(ENV)) {
    delete process.env[key];
  }
});

// ── sendWhatsAppMessage ───────────────────────────────────────────────────

describe("sendWhatsAppMessage", () => {
  it("posts to the correct Graph API endpoint with correct body", async () => {
    const fetchMock = mockFetch(200, { messages: [{ id: "msg1" }] });
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppMessage("+923001234567", "Hello world");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://graph.facebook.com/v23.0/12345678901/messages",
    );
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer test-token-abc");

    const sentBody = JSON.parse(options.body);
    expect(sentBody.messaging_product).toBe("whatsapp");
    expect(sentBody.to).toBe("923001234567"); // leading + stripped
    expect(sentBody.type).toBe("text");
    expect(sentBody.text.body).toBe("Hello world");
  });

  it("strips leading + from phone number", async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppMessage("+44712345678", "Test");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("44712345678");
  });

  it("accepts phone without leading +", async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsAppMessage("923001234567", "Test");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("923001234567");
  });

  it("throws on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(400, { error: { message: "Invalid phone" } }),
    );

    await expect(
      sendWhatsAppMessage("+923001234567", "Hello"),
    ).rejects.toThrow("WhatsApp Cloud API error 400");
  });

  it("throws if env vars are missing", async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(
      sendWhatsAppMessage("+923001234567", "Hello"),
    ).rejects.toThrow("WHATSAPP_PHONE_NUMBER_ID");
  });
});

// ── parseIncomingMessages ─────────────────────────────────────────────────

describe("parseIncomingMessages", () => {
  it("extracts a text message from a well-formed Cloud API payload", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "business-id",
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    id: "wamid.123",
                    from: "923001234567",
                    type: "text",
                    text: { body: "YES" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessages(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "wamid.123",
      from: "923001234567",
      text: "YES",
    });
  });

  it("returns empty array for status update events (no messages array)", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "business-id",
          changes: [
            {
              field: "messages",
              value: {
                statuses: [{ id: "wamid.123", status: "delivered" }],
              },
            },
          ],
        },
      ],
    };

    expect(parseIncomingMessages(payload)).toHaveLength(0);
  });

  it("returns empty array for non-messages field changes", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "business-id",
          changes: [{ field: "account_alerts", value: {} }],
        },
      ],
    };

    expect(parseIncomingMessages(payload)).toHaveLength(0);
  });

  it("skips non-text message types (image, audio, etc.)", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { id: "msg1", from: "923001234567", type: "image" },
                  {
                    id: "msg2",
                    from: "923001234567",
                    type: "text",
                    text: { body: "Hi" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessages(payload);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("msg2");
  });

  it("returns empty array for null or invalid input", () => {
    expect(parseIncomingMessages(null)).toHaveLength(0);
    expect(parseIncomingMessages(undefined)).toHaveLength(0);
    expect(parseIncomingMessages("string")).toHaveLength(0);
    expect(parseIncomingMessages({})).toHaveLength(0);
    expect(parseIncomingMessages({ entry: "not-array" })).toHaveLength(0);
  });

  it("extracts multiple messages from a single payload", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    id: "msg1",
                    from: "923001234567",
                    type: "text",
                    text: { body: "YES" },
                  },
                  {
                    id: "msg2",
                    from: "923009999999",
                    type: "text",
                    text: { body: "CANCEL" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessages(payload);
    expect(result).toHaveLength(2);
    expect(result[0].from).toBe("923001234567");
    expect(result[1].from).toBe("923009999999");
  });
});

// ── validateCloudToken ────────────────────────────────────────────────────

describe("validateCloudToken", () => {
  it("returns phone number details on success", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        id: "12345678901",
        display_phone_number: "+92 300 1234567",
      }),
    );

    const result = await validateCloudToken();
    expect(result.phoneNumberId).toBe("12345678901");
    expect(result.displayPhoneNumber).toBe("+92 300 1234567");
  });

  it("calls the correct endpoint with Authorization header", async () => {
    const fetchMock = mockFetch(200, {
      id: "12345678901",
      display_phone_number: "+92 300 1234567",
    });
    vi.stubGlobal("fetch", fetchMock);

    await validateCloudToken();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("12345678901");
    expect(url).toContain("fields=id,display_phone_number");
    expect(options.headers["Authorization"]).toBe("Bearer test-token-abc");
  });

  it("throws on 401 unauthorized", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { error: "Invalid token" }));
    await expect(validateCloudToken()).rejects.toThrow(
      "Cloud API token validation failed 401",
    );
  });
});
