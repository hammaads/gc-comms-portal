import "./instrument"; // Must be first import — initializes Sentry
import "dotenv/config";
import express from "express";
import * as Sentry from "@sentry/node";
import { createClient } from "@supabase/supabase-js";
import pinoHttp from "pino-http";
import { WhatsAppManager } from "./whatsapp/connection";
import { GoogleSheetsSync } from "./sheets/sync";
import { RetellClient } from "./calling/retell-client";
import { setupCronJobs } from "./cron/scheduler";
import { logger } from "./lib/logger";

const app = express();
app.use(express.json());

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  }),
);

const PORT = process.env.PORT || 3001;

// Supabase admin client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Auth middleware for API endpoints
function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== process.env.RAILWAY_API_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Initialize services
const whatsapp = new WhatsAppManager(supabase);
const sheetsSync = new GoogleSheetsSync(supabase);
const retell = new RetellClient(supabase);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    whatsapp: whatsapp.getStatus(),
    uptime: process.uptime(),
  });
});

// WhatsApp endpoints
app.post("/api/whatsapp/connect", authMiddleware, async (_req, res) => {
  try {
    await whatsapp.connect();
    res.json({ status: "connecting" });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/whatsapp/disconnect", authMiddleware, async (_req, res) => {
  try {
    await whatsapp.disconnect();
    // Clear auth state from Supabase so next connect generates a fresh QR
    const { clearSupabaseAuthState } = await import("./whatsapp/supabase-auth-state");
    await clearSupabaseAuthState(supabase);
    res.json({ status: "disconnected", authCleared: true });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/whatsapp/send", authMiddleware, async (req, res) => {
  const { phone, message } = req.body;
  try {
    await whatsapp.sendMessage(phone, message);
    res.json({ status: "sent" });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/whatsapp/groups", authMiddleware, async (_req, res) => {
  try {
    const groups = await whatsapp.listGroups();
    res.json(groups);
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/whatsapp/group/add", authMiddleware, async (req, res) => {
  const { phone, groupJid } = req.body;
  try {
    const { added, status: addStatus } = await whatsapp.addToGroup(phone, groupJid);

    // 409 = already a member — treat as success, no invite link needed
    if (added || addStatus === 409) {
      res.json({ status: added ? "added" : "already_in_group" });
      return;
    }

    const code = await whatsapp.getGroupInviteCode(groupJid);
    const link = code ? `https://chat.whatsapp.com/${code}` : null;
    res.json({ status: "not_added", link, addStatus });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

// Google Sheets endpoints
app.post("/api/sheets/sync", authMiddleware, async (_req, res) => {
  try {
    const result = await sheetsSync.syncAll();
    res.json(result);
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

// AI Calling endpoints
app.post("/api/calls/batch", authMiddleware, async (req, res) => {
  const { driveId, volunteerIds } = req.body;
  try {
    const result = await retell.batchCall(driveId, volunteerIds);
    res.json(result);
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

// Retell webhook handler (authenticated — same secret as other endpoints)
app.post("/api/webhooks/retell", authMiddleware, async (req, res) => {
  try {
    await retell.handleWebhook(req.body);
    res.json({ received: true });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ error: error.message });
  }
});

// Sentry error handler — must be after all routes, before app.listen
Sentry.setupExpressErrorHandler(app);

// Start server
app.listen(PORT, () => {
  logger.info({ port: PORT }, "Railway service started");

  // Setup cron jobs
  setupCronJobs(supabase, whatsapp, sheetsSync, retell);

  // Auto-connect WhatsApp if configured
  whatsapp.autoReconnect();
});
