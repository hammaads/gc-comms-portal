import { SupabaseClient } from "@supabase/supabase-js";
import qrcode from "qrcode-terminal";
import { whatsappLogger } from "../lib/logger";

// Fixed UUID for the singleton WhatsApp session row
const SESSION_ID = "00000000-0000-0000-0000-000000000001";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 5000; // 5s, then 10s, 20s, 40s, 80s

export class WhatsAppManager {
  private supabase: SupabaseClient;
  private sock: any = null;
  private status: string = "disconnected";
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private processedMessageIds = new Set<string>();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  getStatus(): string {
    return this.status;
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      this.sock.ev.removeAllListeners();
      this.sock.end(undefined);
      this.sock = null;
    }
    this.status = "disconnected";
    await this.updateSessionStatus("disconnected");
  }

  async connect(): Promise<void> {
    // Mutex: prevent concurrent connect() calls
    if (this.connecting) {
      console.log("WhatsApp connect() already in progress, skipping");
      return;
    }
    this.connecting = true;

    // Disconnect any existing session first
    await this.disconnect();
    try {
      // Dynamic import for Baileys (ESM module)
      const { makeWASocket, DisconnectReason } =
        await import("@whiskeysockets/baileys");
      const { useSupabaseAuthState } = await import("./supabase-auth-state");

      const { state, saveCreds } = await useSupabaseAuthState(this.supabase);

      // Silence Baileys internal logs so QR code renders cleanly
      const pino = (await import("pino")).default;
      const silentLogger = pino({ level: "silent" });

      this.sock = makeWASocket({
        auth: state,
        logger: silentLogger as any,
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.status = "qr_pending";
          // Print QR in terminal for scanning
          whatsappLogger.info("QR code generated, scan with WhatsApp");
          qrcode.generate(qr, { small: true });
          // Store QR in database for admin panel display
          await this.supabase
            .from("whatsapp_sessions")
            .upsert(
              { id: SESSION_ID, status: "qr_pending", qr_code: qr },
              { onConflict: "id" },
            );
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const errorMessage = (lastDisconnect?.error as any)?.message || "unknown";
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          whatsappLogger.warn(
            { statusCode, errorMessage, attempt: this.reconnectAttempts },
            "WhatsApp connection closed",
          );

          this.status = "disconnected";
          await this.updateSessionStatus("disconnected");

          if (!shouldReconnect) {
            whatsappLogger.info("Logged out — clearing auth state");
            const { clearSupabaseAuthState } = await import("./supabase-auth-state");
            await clearSupabaseAuthState(this.supabase);
            this.reconnectAttempts = 0;
            return;
          }

          this.reconnectAttempts++;

          if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            whatsappLogger.error(
              { attempts: this.reconnectAttempts },
              "Max reconnect attempts reached — clearing auth state. Re-scan QR from admin panel.",
            );
            const { clearSupabaseAuthState } = await import("./supabase-auth-state");
            await clearSupabaseAuthState(this.supabase);
            this.reconnectAttempts = 0;
            return;
          }

          const delay = BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);
          whatsappLogger.info(
            { delay, attempt: this.reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS },
            "Reconnecting WhatsApp...",
          );
          setTimeout(() => this.connect(), delay);
        } else if (connection === "open") {
          this.reconnectAttempts = 0; // Reset on successful connection
          this.status = "connected";
          const phoneNumber = this.sock?.user?.id?.split(":")[0] || "";
          await this.supabase
            .from("whatsapp_sessions")
            .upsert(
              {
                id: SESSION_ID,
                status: "connected",
                phone_number: phoneNumber,
                qr_code: null,
              },
              { onConflict: "id" },
            );
          whatsappLogger.info({ phoneNumber }, "WhatsApp connected");
        }
      });

      // Handle incoming messages for keyword detection
      this.sock.ev.on("messages.upsert", async (m: any) => {
        if (m.type !== "notify") return;
        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;
          await this.handleIncomingMessage(msg);
        }
      });

      this.connecting = false;
    } catch (error) {
      whatsappLogger.error({ err: error }, "WhatsApp connection error");
      this.status = "disconnected";
      this.connecting = false;
      throw error;
    }
  }

  async autoReconnect(): Promise<void> {
    const { data: session } = await this.supabase
      .from("whatsapp_sessions")
      .select("status")
      .eq("id", SESSION_ID)
      .single();

    if (session?.status === "connected" || session?.status === "qr_pending") {
      try {
        await this.connect();
      } catch {
        whatsappLogger.warn("Auto-reconnect failed, will retry");
      }
    }
  }

  async sendMessage(phone: string, message: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    const jid = phone.replace("+", "") + "@s.whatsapp.net";

    // Send directly with a 15-second timeout
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Send timed out after 15s")), 15000),
    );
    await Promise.race([
      this.sock.sendMessage(jid, { text: message }),
      timeout,
    ]);
  }

  async addToGroup(phone: string, groupJid: string): Promise<{ added: boolean; status?: number }> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    const jid = phone.replace("+", "") + "@s.whatsapp.net";
    try {
      const result = await this.sock.groupParticipantsUpdate(groupJid, [jid], "add");
      const entry = Array.isArray(result) ? result[0] : undefined;
      const status = entry?.status ?? entry?.content?.attrs?.code;
      const statusNum = typeof status === "string" ? parseInt(status) : status;
      const added = statusNum === 200;
      if (!added) {
        whatsappLogger.warn({ phone, groupJid, status: statusNum }, "Group add not successful");
      }
      return { added, status: statusNum };
    } catch (err) {
      whatsappLogger.error({ err, phone, groupJid }, "Group add threw error");
      return { added: false };
    }
  }

  async sendGroupMessage(groupJid: string, message: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    await this.sock.sendMessage(groupJid, { text: message });
  }

  async getGroupInviteCode(groupJid: string): Promise<string | undefined> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    return this.sock.groupInviteCode(groupJid);
  }

  async listGroups(): Promise<{ id: string; subject: string }[]> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    const groups = await this.sock.groupFetchAllParticipating();
    return Object.values(groups).map((g: any) => ({
      id: g.id,
      subject: g.subject,
    }));
  }

  private async handleIncomingMessage(msg: any): Promise<void> {
    const remoteJid: string = msg.key.remoteJid || "";

    // Skip group messages — only process DMs
    if (remoteJid.endsWith("@g.us")) return;

    // Deduplication: skip messages we've already processed
    const msgId = msg.key.id;
    if (msgId && this.processedMessageIds.has(msgId)) return;
    if (msgId) {
      this.processedMessageIds.add(msgId);
      // Cap the set size to prevent memory leak
      if (this.processedMessageIds.size > 10000) {
        const first = this.processedMessageIds.values().next().value;
        if (first) this.processedMessageIds.delete(first);
      }
    }

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";
    if (!text) return;

    // Bug fix #5: Normalize phone for lookup — try with and without "+"
    const rawPhone = remoteJid.split("@")[0];
    const phoneWithPlus = "+" + rawPhone;

    // Get WhatsApp config for keywords
    const { data: config } = await this.supabase
      .from("app_config")
      .select("value")
      .eq("key", "whatsapp")
      .single();

    const whatsappConfig = config?.value as {
      confirm_keywords: string[];
      cancel_keywords: string[];
    } | null;

    if (!whatsappConfig) return;

    // Bug fix #5: Try both phone formats to find the volunteer
    let volunteer: { id: string } | null = null;
    const { data: v1 } = await this.supabase
      .from("volunteers")
      .select("id")
      .eq("phone", phoneWithPlus)
      .single();
    volunteer = v1;

    if (!volunteer) {
      const { data: v2 } = await this.supabase
        .from("volunteers")
        .select("id")
        .eq("phone", rawPhone)
        .single();
      volunteer = v2;
    }

    if (!volunteer) return;

    // Bug fix #2: Exact word matching instead of substring includes
    const words = text.toLowerCase().trim().split(/\s+/);

    const isConfirm = whatsappConfig.confirm_keywords?.some((k) =>
      words.includes(k.toLowerCase()),
    );
    const isCancel = whatsappConfig.cancel_keywords?.some((k) =>
      words.includes(k.toLowerCase()),
    );

    if (isConfirm) {
      // Bug fix #3: Only confirm the next upcoming drive, not all drives
      const { data: nextAssignment } = await this.supabase
        .from("assignments")
        .select("id, drive_id, drives(drive_date)")
        .eq("volunteer_id", volunteer.id)
        .eq("status", "assigned")
        .order("drives(drive_date)", { ascending: true })
        .limit(1)
        .single();

      if (nextAssignment) {
        await this.supabase
          .from("assignments")
          .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
          .eq("id", nextAssignment.id);

        // Bug fix #6: Include drive_id in log
        await this.supabase.from("communication_log").insert({
          volunteer_id: volunteer.id,
          drive_id: nextAssignment.drive_id,
          channel: "whatsapp",
          direction: "inbound",
          content: text,
          whatsapp_message_id: msg.key.id,
        });

        // Bug fix #6: Send confirmation reply
        try {
          await this.sendMessage(phoneWithPlus, "Your attendance has been confirmed. JazakAllah Khair!");
        } catch {
          // Non-critical — don't fail if reply doesn't send
        }
      }
      return;
    }

    if (isCancel) {
      // Bug fix #3: Only cancel the next upcoming drive assignment
      const { data: nextAssignment } = await this.supabase
        .from("assignments")
        .select("id, drive_id, drives(drive_date)")
        .eq("volunteer_id", volunteer.id)
        .in("status", ["assigned", "confirmed"])
        .order("drives(drive_date)", { ascending: true })
        .limit(1)
        .single();

      if (nextAssignment) {
        await this.supabase
          .from("assignments")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "WhatsApp cancel keyword",
          })
          .eq("id", nextAssignment.id);

        // Bug fix #6: Include drive_id in log
        await this.supabase.from("communication_log").insert({
          volunteer_id: volunteer.id,
          drive_id: nextAssignment.drive_id,
          channel: "whatsapp",
          direction: "inbound",
          content: text,
          whatsapp_message_id: msg.key.id,
        });

        // Bug fix #6: Send cancellation reply
        try {
          await this.sendMessage(phoneWithPlus, "Your assignment has been cancelled. If this was a mistake, please reply with 'confirm'.");
        } catch {
          // Non-critical
        }
      }
      return;
    }

    // Unrecognized message — just log it
    await this.supabase.from("communication_log").insert({
      volunteer_id: volunteer.id,
      channel: "whatsapp",
      direction: "inbound",
      content: text,
      whatsapp_message_id: msg.key.id,
    });
  }

  private async updateSessionStatus(status: string): Promise<void> {
    await this.supabase
      .from("whatsapp_sessions")
      .upsert(
        { id: SESSION_ID, status, qr_code: null },
        { onConflict: "id" },
      );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
