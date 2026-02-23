import { SupabaseClient } from "@supabase/supabase-js";
import qrcode from "qrcode-terminal";
import { whatsappLogger } from "../lib/logger";
import { MapCacheStore, MessageStore } from "./cache-store";
import { SendQueue } from "./send-queue";

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

  // Caches and queue for production hardening
  private messageStore: MessageStore;
  private sendQueue: SendQueue;
  private groupMetadataCache = new Map<string, any>();
  private msgRetryCounterCache: MapCacheStore;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.messageStore = new MessageStore();
    this.sendQueue = new SendQueue({ delayMs: 1000, burstLimit: 5 });
    this.msgRetryCounterCache = new MapCacheStore({
      maxSize: 512,
      defaultTtlMs: 10 * 60 * 1000, // 10 min
    });
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
    this.groupMetadataCache.clear();
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
      const {
        default: makeWASocket,
        DisconnectReason,
        fetchLatestBaileysVersion,
        isJidBroadcast,
        isJidStatusBroadcast,
        isJidNewsletter,
        isJidMetaAI,
      } = await import("baileys");
      const { useSupabaseAuthState } = await import("./supabase-auth-state");

      const { state, saveCreds } = await useSupabaseAuthState(this.supabase);

      // Load rate limit config from DB
      const { data: waConf } = await this.supabase
        .from("app_config")
        .select("value")
        .eq("key", "whatsapp")
        .single();
      const rateConfig = waConf?.value as {
        rate_limit_per_second?: number;
        rate_limit_burst?: number;
      } | null;
      if (rateConfig?.rate_limit_per_second) {
        const delayMs = Math.round(1000 / rateConfig.rate_limit_per_second);
        this.sendQueue.updateConfig(delayMs, rateConfig.rate_limit_burst ?? 5);
        whatsappLogger.info(
          { delayMs, burst: rateConfig.rate_limit_burst },
          "Send queue rate limit configured",
        );
      }

      // Fetch latest WA Web version to avoid 405 errors
      let version: [number, number, number] | undefined;
      try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
        whatsappLogger.info({ version }, "Fetched latest Baileys version");
      } catch (err) {
        whatsappLogger.warn({ err }, "Could not fetch latest version, using default");
      }

      // Silence Baileys internal logs so QR code renders cleanly
      const pino = (await import("pino")).default;
      const silentLogger = pino({ level: "silent" });

      this.sock = makeWASocket({
        auth: state,
        logger: silentLogger,

        // Version management: avoids 405 errors (issue #1913)
        ...(version ? { version } : {}),

        // Connection tuning
        markOnlineOnConnect: false, // Don't suppress phone notifications
        connectTimeoutMs: 45_000, // More forgiving than default 20s
        keepAliveIntervalMs: 25_000, // Slightly tighter than default 30s
        countryCode: "PK", // Pakistan phone number formatting

        // Message retry support (solves "waiting for message" — issue #1767)
        msgRetryCounterCache: this.msgRetryCounterCache,
        getMessage: (key: any) => this.messageStore.getMessage(key),

        // Group metadata cache (prevents rate limits/bans — issue #1166)
        cachedGroupMetadata: (jid: string) =>
          this.getCachedGroupMetadata(jid),

        // Reduce protocol noise (reduces encryption errors — issue #1769)
        shouldIgnoreJid: (jid: string) =>
          !!(
            isJidBroadcast(jid) ||
            isJidStatusBroadcast(jid) ||
            isJidNewsletter(jid) ||
            isJidMetaAI(jid)
          ),

        // Bot doesn't need history sync
        shouldSyncHistoryMessage: () => false,
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
          const statusCode = (lastDisconnect?.error as any)?.output
            ?.statusCode;
          const errorMessage =
            (lastDisconnect?.error as any)?.message || "unknown";
          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut;

          whatsappLogger.warn(
            { statusCode, errorMessage, attempt: this.reconnectAttempts },
            "WhatsApp connection closed",
          );

          this.status = "disconnected";
          this.connecting = false;
          await this.updateSessionStatus("disconnected");

          if (!shouldReconnect) {
            whatsappLogger.info("Logged out — clearing auth state");
            const { clearSupabaseAuthState } = await import(
              "./supabase-auth-state"
            );
            await clearSupabaseAuthState(this.supabase);
            this.reconnectAttempts = 0;
            return;
          }

          // Handle 405: WA Web version expired — next connect() will fetch fresh version
          if (statusCode === 405) {
            whatsappLogger.warn(
              "405: WA Web version expired. Will reconnect with fresh version fetch.",
            );
          }

          // Handle 515: restart required — reconnect immediately, don't count against attempts
          if (statusCode === DisconnectReason.restartRequired) {
            whatsappLogger.info(
              "515: Restart required — reconnecting immediately",
            );
            this.reconnectAttempts = 0;
            setTimeout(() => this.connect(), 1000);
            return;
          }

          this.reconnectAttempts++;

          if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            whatsappLogger.warn(
              { attempts: this.reconnectAttempts },
              "Max reconnect attempts reached — deferring to health-check cron",
            );
            this.reconnectAttempts = 0;
            return;
          }

          // Exponential backoff with jitter to avoid thundering herd
          const baseDelay =
            BASE_RECONNECT_DELAY *
            Math.pow(2, this.reconnectAttempts - 1);
          const jitter = Math.floor(Math.random() * baseDelay * 0.3);
          const delay = baseDelay + jitter;

          whatsappLogger.info(
            {
              delay,
              attempt: this.reconnectAttempts,
              maxAttempts: MAX_RECONNECT_ATTEMPTS,
            },
            "Reconnecting WhatsApp...",
          );
          setTimeout(() => this.connect(), delay);
        } else if (connection === "open") {
          this.reconnectAttempts = 0;
          this.connecting = false;
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

          // Populate group metadata cache
          try {
            const groups = await this.sock.groupFetchAllParticipating();
            this.groupMetadataCache.clear();
            for (const [id, metadata] of Object.entries(groups)) {
              this.groupMetadataCache.set(id, metadata);
            }
            whatsappLogger.info(
              { groupCount: this.groupMetadataCache.size },
              "Group metadata cache populated",
            );
          } catch (err) {
            whatsappLogger.warn(
              { err },
              "Failed to populate group metadata cache",
            );
          }
        }
      });

      // Handle incoming messages for keyword detection
      this.sock.ev.on("messages.upsert", async (m: any) => {
        if (m.type !== "notify") return;
        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;
          try {
            await this.handleIncomingMessage(msg);
          } catch (err) {
            whatsappLogger.error(
              { err, remoteJid: msg.key?.remoteJid, msgId: msg.key?.id },
              "Error processing incoming message",
            );
          }
        }
      });

      // Keep group metadata cache updated
      this.sock.ev.on("groups.update", (updates: any[]) => {
        for (const update of updates) {
          const existing = this.groupMetadataCache.get(update.id);
          if (existing) {
            this.groupMetadataCache.set(update.id, {
              ...existing,
              ...update,
            });
          }
        }
      });

      this.sock.ev.on(
        "group-participants.update",
        async ({ id }: { id: string }) => {
          // Only re-fetch for groups we're already tracking
          if (!this.groupMetadataCache.has(id)) return;
          try {
            // Re-fetch full metadata to keep participant list and addressing_mode in sync
            const metadata = await this.sock.groupMetadata(id);
            this.groupMetadataCache.set(id, metadata);
          } catch (err) {
            whatsappLogger.warn(
              { err, groupId: id },
              "Failed to refresh group metadata after participant update",
            );
          }
        },
      );
    } catch (error) {
      whatsappLogger.error({ err: error }, "WhatsApp connection error");
      this.status = "disconnected";
      this.connecting = false;
      throw error;
    }
  }

  async autoReconnect(): Promise<void> {
    try {
      await this.connect();
    } catch {
      whatsappLogger.warn("Auto-reconnect failed, will retry next cycle");
    }
  }

  async sendMessage(phone: string, message: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    const jid = phone.replace("+", "") + "@s.whatsapp.net";

    await this.sendQueue.enqueue(async () => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Send timed out after 15s")),
          15000,
        ),
      );
      const sentMsg = await Promise.race([
        this.sock.sendMessage(jid, { text: message }),
        timeout,
      ]);

      // Store for Baileys retry mechanism
      if (sentMsg?.key?.id && sentMsg?.message) {
        this.messageStore.store(sentMsg.key.id, sentMsg.message);
      }
    }, `dm:${jid}`);
  }

  async addToGroup(
    phone: string,
    groupJid: string,
  ): Promise<{ added: boolean; status?: number }> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    const jid = phone.replace("+", "") + "@s.whatsapp.net";
    try {
      const result = await this.sock.groupParticipantsUpdate(
        groupJid,
        [jid],
        "add",
      );
      const entry = Array.isArray(result) ? result[0] : undefined;
      const status = entry?.status ?? entry?.content?.attrs?.code;
      const statusNum = typeof status === "string" ? parseInt(status) : status;
      const added = statusNum === 200;
      if (!added) {
        whatsappLogger.warn(
          { phone, groupJid, status: statusNum },
          "Group add not successful",
        );
      }
      return { added, status: statusNum };
    } catch (err) {
      whatsappLogger.error({ err, phone, groupJid }, "Group add threw error");
      return { added: false };
    }
  }

  async sendGroupMessage(groupJid: string, message: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp not connected");

    await this.sendQueue.enqueue(async () => {
      const sentMsg = await this.sock.sendMessage(groupJid, {
        text: message,
      });
      if (sentMsg?.key?.id && sentMsg?.message) {
        this.messageStore.store(sentMsg.key.id, sentMsg.message);
      }
    }, `group:${groupJid}`);
  }

  async getGroupInviteCode(groupJid: string): Promise<string | undefined> {
    if (!this.sock) throw new Error("WhatsApp not connected");
    return this.sock.groupInviteCode(groupJid);
  }

  async listGroups(): Promise<{ id: string; subject: string }[]> {
    if (!this.sock) throw new Error("WhatsApp not connected");

    // Use cache if populated
    if (this.groupMetadataCache.size > 0) {
      return Array.from(this.groupMetadataCache.values()).map((g: any) => ({
        id: g.id,
        subject: g.subject,
      }));
    }

    const groups = await this.sock.groupFetchAllParticipating();
    for (const [id, metadata] of Object.entries(groups)) {
      this.groupMetadataCache.set(id, metadata);
    }
    return Object.values(groups).map((g: any) => ({
      id: g.id,
      subject: g.subject,
    }));
  }

  private async getCachedGroupMetadata(
    jid: string,
  ): Promise<any | undefined> {
    const cached = this.groupMetadataCache.get(jid);
    if (cached) return cached;

    // Cache miss: fetch and store
    try {
      if (!this.sock) return undefined;
      const metadata = await this.sock.groupMetadata(jid);
      this.groupMetadataCache.set(jid, metadata);
      return metadata;
    } catch {
      return undefined;
    }
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

    whatsappLogger.info(
      {
        remoteJid,
        msgId,
        hasText: !!text,
        messageKeys: Object.keys(msg.message || {}),
      },
      "Incoming WhatsApp message received",
    );

    if (!text) {
      whatsappLogger.debug(
        { remoteJid, msgId },
        "Skipping message with no text content",
      );
      return;
    }

    // Resolve LID format (@lid) to actual phone number
    let rawPhone: string;
    if (remoteJid.endsWith("@lid")) {
      try {
        const phoneJid =
          await this.sock?.signalRepository?.lidMapping?.getPNForLID(
            remoteJid,
          );
        if (phoneJid) {
          // phoneJid is like "14699272476:0@s.whatsapp.net" — extract phone before ":"
          rawPhone = phoneJid.split(":")[0];
          whatsappLogger.info(
            { remoteJid, resolvedPhone: rawPhone },
            "Resolved LID to phone number",
          );
        } else {
          whatsappLogger.warn(
            { remoteJid },
            "Could not resolve LID to phone number — no mapping found",
          );
          return;
        }
      } catch (err) {
        whatsappLogger.error(
          { err, remoteJid },
          "Failed to resolve LID to phone number",
        );
        return;
      }
    } else {
      rawPhone = remoteJid.split("@")[0];
    }
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

    if (!whatsappConfig) {
      whatsappLogger.warn(
        "No WhatsApp config found in app_config — cannot process incoming message",
      );
      return;
    }

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

    if (!volunteer) {
      whatsappLogger.warn(
        { rawPhone, phoneWithPlus },
        "Incoming message from unknown volunteer — phone not found",
      );
      return;
    }

    whatsappLogger.info(
      { volunteerId: volunteer.id, rawPhone, text: text.substring(0, 100) },
      "Processing incoming message from volunteer",
    );

    // Bug fix #2: Exact word matching instead of substring includes
    const words = text.toLowerCase().trim().split(/\s+/);

    const isConfirm = whatsappConfig.confirm_keywords?.some((k) =>
      words.includes(k.toLowerCase()),
    );
    const isCancel = whatsappConfig.cancel_keywords?.some((k) =>
      words.includes(k.toLowerCase()),
    );

    if (isConfirm) {
      whatsappLogger.info(
        { volunteerId: volunteer.id },
        "Confirm keyword detected",
      );
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
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
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

        whatsappLogger.info(
          {
            volunteerId: volunteer.id,
            assignmentId: nextAssignment.id,
            driveId: nextAssignment.drive_id,
          },
          "Assignment confirmed via WhatsApp",
        );

        // Bug fix #6: Send confirmation reply
        try {
          await this.sendMessage(
            phoneWithPlus,
            "Your attendance has been confirmed. JazakAllah Khair!",
          );
        } catch {
          // Non-critical — don't fail if reply doesn't send
        }
      } else {
        whatsappLogger.warn(
          { volunteerId: volunteer.id },
          "Confirm keyword but no assigned assignment found",
        );
      }
      return;
    }

    if (isCancel) {
      whatsappLogger.info(
        { volunteerId: volunteer.id },
        "Cancel keyword detected",
      );
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

        whatsappLogger.info(
          {
            volunteerId: volunteer.id,
            assignmentId: nextAssignment.id,
            driveId: nextAssignment.drive_id,
          },
          "Assignment cancelled via WhatsApp",
        );

        // Bug fix #6: Send cancellation reply
        try {
          await this.sendMessage(
            phoneWithPlus,
            "Your assignment has been cancelled. If this was a mistake, please reply with 'confirm'.",
          );
        } catch {
          // Non-critical
        }
      } else {
        whatsappLogger.warn(
          { volunteerId: volunteer.id },
          "Cancel keyword but no active assignment found",
        );
      }
      return;
    }

    // Unrecognized message — just log it
    whatsappLogger.info(
      { volunteerId: volunteer.id },
      "No keyword match — logging inbound message",
    );
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
}
