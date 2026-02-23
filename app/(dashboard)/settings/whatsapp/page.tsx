"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2,
  Wifi,
  WifiOff,
  QrCode,
  RefreshCw,
  Unplug,
  Plus,
  Trash2,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  Server,
  Check,
  ChevronsUpDown,
  AlertTriangle,
} from "lucide-react";
import { CountryCodePicker } from "@/components/ui/country-code-picker";
import { normalizePhone } from "@/lib/utils";
import { SkeletonForm } from "@/components/ui/skeleton-form";
import { Skeleton } from "@/components/ui/skeleton";
import QRCode from "qrcode";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScheduledMessage {
  id: string;
  drive_id: string | null;
  volunteer_id: string | null;
  group_jid: string | null;
  channel: string;
  message: string;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  created_at: string;
  drives?: { name: string } | null;
  volunteers?: { name: string; phone: string } | null;
}

interface Drive {
  id: string;
  name: string;
  drive_date: string;
}

interface Volunteer {
  id: string;
  name: string;
  phone: string;
}

// ─── QR Image Component ─────────────────────────────────────────────────────

function QrImage({ data }: { data: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && data) {
      QRCode.toCanvas(canvasRef.current, data, {
        width: 280,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
    }
  }, [data]);

  return (
    <div className="mt-4 flex justify-center rounded-lg border bg-white p-6">
      <canvas ref={canvasRef} />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function WhatsAppSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<any>(null);
  const [savedConfig, setSavedConfig] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectPollFails, setConnectPollFails] = useState(0);
  const [serviceHealth, setServiceHealth] = useState<{
    status: string;
    uptime: number;
  } | null>(null);

  // WhatsApp groups state
  const [groups, setGroups] = useState<{ id: string; subject: string }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  // Test message state
  const [testPhone, setTestPhone] = useState("");
  const [testCountryCode, setTestCountryCode] = useState("+92");
  const [testMessage, setTestMessage] = useState("Hello! This is a test message from GC Comms Portal.");
  const [sendingTest, setSendingTest] = useState(false);

  // Scheduled messages state
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newMessage, setNewMessage] = useState({
    drive_id: "",
    target: "group" as "group" | "volunteer" | "all_assigned",
    volunteer_id: "",
    message: "",
    scheduled_at: "",
  });

  // Dirty state tracking
  const isDirty = config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/session");
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        if (data.status === "qr_pending" || data.status === "connected") {
          setConnecting(false);
        }
        if (data.status === "connected" && groups.length === 0) {
          loadGroups();
        }
      } else {
        // Session endpoint failed — give it a few tries before giving up
        setConnectPollFails((prev) => {
          if (prev >= 5) {
            setSession({ status: "disconnected" });
            setConnecting(false);
            return 0;
          }
          return prev + 1;
        });
      }
    } catch {
      setConnectPollFails((prev) => {
        if (prev >= 5) {
          setSession({ status: "disconnected" });
          setConnecting(false);
          return 0;
        }
        return prev + 1;
      });
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      await Promise.all([
        loadConfig(),
        loadSession(),
        loadServiceHealth(),
        loadScheduledMessages(),
        loadDrives(),
        loadVolunteers(),
      ]);
      setLoading(false);
    }
    loadData();
  }, []);

  // Poll for session updates only when connecting or waiting for QR scan
  useEffect(() => {
    const shouldPoll =
      connecting ||
      session?.status === "qr_pending" ||
      session?.status === "disconnected";
    if (!shouldPoll) return;

    const interval = setInterval(() => loadSession(), 3000);
    return () => clearInterval(interval);
  }, [connecting, session?.status, loadSession]);

  // Warn on navigation with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  async function loadConfig() {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "whatsapp")
      .single();
    if (data?.value) {
      setConfig(data.value);
      setSavedConfig(data.value);
    }
  }

  async function loadServiceHealth() {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const data = await res.json();
        setServiceHealth(data);
      }
    } catch {
      setServiceHealth(null);
    }
  }

  async function loadScheduledMessages() {
    const { data, error } = await supabase
      .from("scheduled_messages")
      .select("*, drives(name), volunteers(name, phone)")
      .in("status", ["pending", "sent", "failed"])
      .order("scheduled_at", { ascending: true })
      .limit(50);
    if (!error && data) setScheduledMessages(data as ScheduledMessage[]);
  }

  async function loadDrives() {
    const { data } = await supabase
      .from("drives")
      .select("id, name, drive_date")
      .in("status", ["draft", "open", "in_progress"])
      .order("drive_date", { ascending: true });
    if (data) setDrives(data);
  }

  async function loadVolunteers() {
    const { data } = await supabase
      .from("volunteers")
      .select("id, name, phone")
      .order("name")
      .limit(200);
    if (data) setVolunteers(data);
  }

  async function loadGroups() {
    setLoadingGroups(true);
    try {
      const res = await fetch("/api/whatsapp/groups");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setGroups(data);
      }
    } catch {
      // Groups not available
    } finally {
      setLoadingGroups(false);
    }
  }

  // ─── Connection Actions ──────────────────────────────────────────────────

  async function handleConnect() {
    setConnecting(true);
    setConnectPollFails(0);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.info("Connecting... QR code will appear shortly.");
      } else {
        toast.error(data.error || "Failed to connect");
        setConnecting(false);
      }
    } catch {
      toast.error("Failed to reach the server");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Disconnected and session cleared");
        setSession({ ...session, status: "disconnected", qr_code: null });
      } else {
        toast.error(data.error || "Failed to disconnect");
      }
    } catch {
      toast.error("Failed to reach the server");
    } finally {
      setDisconnecting(false);
    }
  }

  // ─── Test Message ─────────────────────────────────────────────────────────

  async function handleSendTest() {
    if (!testPhone || !testMessage) {
      toast.error("Phone number and message are required");
      return;
    }
    setSendingTest(true);
    toast.info("Sending... this may take a few seconds");
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizePhone(testPhone, testCountryCode), message: testMessage }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Test message sent!");
      } else {
        toast.error(data.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to reach the server");
    } finally {
      setSendingTest(false);
    }
  }

  // ─── Settings Save ───────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("app_config")
      .update({ value: config })
      .eq("key", "whatsapp");
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSavedConfig(config);
      toast.success("Settings saved");
    }
  }

  // ─── Scheduled Messages ──────────────────────────────────────────────────

  async function createScheduledMessage() {
    if (!newMessage.message || !newMessage.scheduled_at) {
      toast.error("Message and scheduled time are required");
      return;
    }

    const groupJid = config?.volunteer_group_jid || null;
    const driveId = newMessage.drive_id && newMessage.drive_id !== "__none__"
      ? newMessage.drive_id
      : null;

    if (newMessage.target === "group" && !groupJid) {
      toast.error("No volunteer group configured");
      return;
    }

    if (newMessage.target === "volunteer" && !newMessage.volunteer_id) {
      toast.error("Select a volunteer");
      return;
    }

    if (newMessage.target === "all_assigned" && !driveId) {
      toast.error("Select a drive when targeting all assigned volunteers");
      return;
    }

    setIsCreating(true);

    if (newMessage.target === "all_assigned" && driveId) {
      const { data: assignments } = await supabase
        .from("assignments")
        .select("volunteer_id")
        .eq("drive_id", driveId)
        .in("status", ["assigned", "confirmed"]);

      if (!assignments || assignments.length === 0) {
        toast.error("No assigned volunteers found for this drive");
        setIsCreating(false);
        return;
      }

      const rows = assignments.map((a) => ({
        drive_id: driveId,
        volunteer_id: a.volunteer_id,
        channel: "whatsapp",
        message: newMessage.message,
        scheduled_at: newMessage.scheduled_at,
        status: "pending",
      }));

      const { error } = await supabase.from("scheduled_messages").insert(rows);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Scheduled ${rows.length} messages`);
      }
    } else {
      const row = {
        drive_id: driveId,
        volunteer_id: newMessage.target === "volunteer" ? newMessage.volunteer_id : null,
        group_jid: newMessage.target === "group" ? groupJid : null,
        channel: "whatsapp",
        message: newMessage.message,
        scheduled_at: newMessage.scheduled_at,
        status: "pending",
      };

      const { error } = await supabase.from("scheduled_messages").insert(row);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Message scheduled");
      }
    }

    setIsCreating(false);
    setNewMessage({ drive_id: "", target: "group", volunteer_id: "", message: "", scheduled_at: "" });
    loadScheduledMessages();
  }

  async function cancelScheduledMessage(id: string) {
    const { error } = await supabase
      .from("scheduled_messages")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Message cancelled");
      loadScheduledMessages();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const isEnabled = config?.enabled ?? false;
  const groupName = groups.find((g) => g.id === config?.volunteer_group_jid)?.subject;

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8 page-fade-in max-w-4xl">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <SkeletonForm fields={5} />
      </div>
    );
  }

  return (
    <div className="space-y-8 page-fade-in max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp Settings</h1>
        <p className="text-muted-foreground">
          Manage WhatsApp connection, messaging, and automated reminders
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1: STATUS
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Enable + Service Health ────────────────────────────────────── */}
      {config && (
        <Card className="stagger-item">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex-1 flex items-center gap-4">
              <div>
                <Label className="text-base">Enable WhatsApp</Label>
                <p className="text-sm text-muted-foreground">
                  Master switch — all messaging, reminders, and group-adds are paused when off
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {serviceHealth && (
                <Badge variant={serviceHealth.status === "ok" ? "success" : "destructive"} className="gap-1">
                  <Server className="h-3 w-3" />
                  {serviceHealth.status === "ok" ? "Online" : "Offline"}
                </Badge>
              )}
              <Switch
                checked={config.enabled}
                onCheckedChange={(v) => setConfig({ ...config, enabled: v })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Disabled banner ────────────────────────────────────────────── */}
      {config && !isEnabled && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            WhatsApp is disabled. Enable it above and save to start sending messages.
          </p>
        </div>
      )}

      {/* ── Connection Status ──────────────────────────────────────────── */}
      <Card className="stagger-item">
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Link your WhatsApp account by scanning the QR code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {session?.status === "connected" ? (
              <>
                <Wifi className="h-6 w-6 text-green-500" />
                <div className="flex-1">
                  <Badge variant="success">Connected</Badge>
                  {session.phone_number && (
                    <p className="text-sm text-muted-foreground mt-1">
                      +{session.phone_number}
                    </p>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Unplug className="mr-2 h-4 w-4" />
                  )}
                  Disconnect
                </Button>
              </>
            ) : session?.status === "qr_pending" ? (
              <div className="w-full">
                <div className="flex items-center gap-4 mb-2">
                  <QrCode className="h-6 w-6 text-yellow-500" />
                  <div className="flex-1">
                    <Badge variant="warning">Waiting for Scan</Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Open WhatsApp &gt; Linked Devices &gt; Link a Device
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConnect}
                    disabled={connecting}
                  >
                    {connecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh QR
                  </Button>
                </div>
                {session.qr_code && <QrImage data={session.qr_code} />}
              </div>
            ) : connecting ? (
              <div className="w-full">
                <div className="flex items-center gap-4">
                  <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                  <div className="flex-1">
                    <Badge variant="secondary">Connecting...</Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Generating QR code, please wait...
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-center rounded-lg border border-dashed p-8">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin" />
                    <p className="text-sm">Preparing WhatsApp session...</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <WifiOff className="h-6 w-6 text-red-500" />
                <div className="flex-1">
                  <Badge variant="destructive">Disconnected</Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click Connect to generate a QR code
                  </p>
                </div>
                <Button onClick={handleConnect} disabled={connecting}>
                  <Wifi className="mr-2 h-4 w-4" />
                  Connect
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2: CONFIGURATION
          ════════════════════════════════════════════════════════════════════ */}
      {config && (
        <>
          {/* ── Volunteer Group ──────────────────────────────────────────── */}
          <Card className="stagger-item">
            <CardHeader>
              <CardTitle>Volunteer Group</CardTitle>
              <CardDescription>
                New volunteers are auto-added to this group when they sign up
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {session?.status === "connected" ? (
                <div className="flex items-end gap-4">
                  <div className="flex-1 space-y-2">
                    <Label>WhatsApp Group</Label>
                    <Popover open={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={groupPickerOpen}
                          className="w-full justify-between font-normal"
                        >
                          {config.volunteer_group_jid
                            ? groupName ?? "Selected group"
                            : "Select a group..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search groups..." />
                          <CommandList>
                            <CommandEmpty>No groups found.</CommandEmpty>
                            <CommandGroup>
                              {groups.map((g) => (
                                <CommandItem
                                  key={g.id}
                                  value={g.subject}
                                  onSelect={() => {
                                    setConfig({ ...config, volunteer_group_jid: g.id });
                                    setGroupPickerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      config.volunteer_group_jid === g.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    }`}
                                  />
                                  {g.subject}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadGroups}
                    disabled={loadingGroups}
                  >
                    {loadingGroups ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Connect WhatsApp first to select a group
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Welcome Message ──────────────────────────────────────────── */}
          <Card className="stagger-item">
            <CardHeader>
              <CardTitle>Welcome Message</CardTitle>
              <CardDescription>
                Sent as a DM to new volunteers after they sign up. If they can&apos;t be added to the group automatically, the invite link is sent as a separate follow-up message.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Message Template</Label>
                <Textarea
                  rows={5}
                  value={config.welcome_dm_template || ""}
                  placeholder={"Assalamu Alaikum {name}!\n\nJazakAllah Khair for signing up as a volunteer for Grand Citizens Iftaar Drive.\n\n{assignments}"}
                  onChange={(e) =>
                    setConfig({ ...config, welcome_dm_template: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{name}"}, {"{assignments}"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── Auto Reminders ──────────────────────────────────────────── */}
          <Card className="stagger-item">
            <CardHeader>
              <CardTitle>Auto Reminders</CardTitle>
              <CardDescription>
                Automatically remind assigned volunteers about upcoming drives.
                Sends once daily, then every 12 hours when the drive is tomorrow or today.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Enable Auto Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Applies to all upcoming drives
                  </p>
                </div>
                <Switch
                  checked={config.auto_reminders_enabled ?? false}
                  onCheckedChange={(v) =>
                    setConfig({ ...config, auto_reminders_enabled: v })
                  }
                />
              </div>
              {config.auto_reminders_enabled && (
                <div className="space-y-2">
                  <Label>Reminder Template</Label>
                  <Textarea
                    rows={4}
                    value={config.auto_reminder_template || "Assalam o Alaikum {name}! Reminder: You are assigned to {duty} for {drive_name} at {location}. {days_remaining} day(s) remaining. Please confirm by replying YES."}
                    onChange={(e) =>
                      setConfig({ ...config, auto_reminder_template: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Variables: {"{name}"}, {"{duty}"}, {"{drive_name}"}, {"{location}"}, {"{sunset_time}"}, {"{days_remaining}"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Keyword Detection ───────────────────────────────────────── */}
          <Card className="stagger-item">
            <CardHeader>
              <CardTitle>Keyword Detection</CardTitle>
              <CardDescription>
                When a volunteer replies with one of these words, their assignment is
                automatically confirmed or cancelled
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Confirm Keywords (comma-separated)</Label>
                <Input
                  value={config.confirm_keywords?.join(", ")}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      confirm_keywords: e.target.value
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="confirm, yes, haan, ji"
                />
              </div>
              <div className="space-y-2">
                <Label>Cancel Keywords (comma-separated)</Label>
                <Input
                  value={config.cancel_keywords?.join(", ")}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cancel_keywords: e.target.value
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="cancel, no, nahi"
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Rate Limiting ───────────────────────────────────────────── */}
          <Card className="stagger-item">
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
              <CardDescription>
                Controls how fast messages are sent to avoid WhatsApp throttling.
                Lower values are safer but slower for bulk sends.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Messages per second</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.rate_limit_per_second}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setConfig({ ...config, rate_limit_per_second: v });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Burst limit</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.rate_limit_burst}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setConfig({ ...config, rate_limit_burst: v });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Max messages in a quick burst before throttling kicks in
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Save Button ─────────────────────────────────────────────── */}
          <div className="border-t border-border pt-6 flex items-center gap-4">
            <Button onClick={save} disabled={saving || !isDirty}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Settings
            </Button>
            {isDirty && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                You have unsaved changes
              </p>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3: ACTIONS
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Test Message ─────────────────────────────────────────────── */}
      {session?.status === "connected" && (
        <Card className="stagger-item">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Test Message
            </CardTitle>
            <CardDescription>
              Send a quick message to verify the connection is working
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <div className="flex gap-2">
                  <CountryCodePicker value={testCountryCode} onChange={setTestCountryCode} />
                  <Input
                    placeholder="3XX XXXXXXX"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Input
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={handleSendTest}
              disabled={sendingTest}
              size="sm"
            >
              {sendingTest ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Test
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Scheduled Messages ─────────────────────────────────────────── */}
      <Card className="stagger-item">
        <CardHeader>
          <CardTitle>Scheduled Messages</CardTitle>
          <CardDescription>
            Schedule one-off WhatsApp messages to volunteers or groups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* New message form */}
          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Scheduled Message
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Drive
                  {newMessage.target === "all_assigned" ? (
                    <span className="text-destructive"> *</span>
                  ) : (
                    <span className="text-muted-foreground font-normal"> (optional)</span>
                  )}
                </Label>
                <Select
                  value={newMessage.drive_id}
                  onValueChange={(v) =>
                    setNewMessage({ ...newMessage, drive_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a drive" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No drive</SelectItem>
                    {drives.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.drive_date})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Send to</Label>
                <Select
                  value={newMessage.target}
                  onValueChange={(v: "group" | "volunteer" | "all_assigned") =>
                    setNewMessage({ ...newMessage, target: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">Volunteer Group</SelectItem>
                    <SelectItem value="volunteer">Specific Volunteer</SelectItem>
                    <SelectItem value="all_assigned">
                      All Assigned (Drive)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newMessage.target === "volunteer" && (
              <div className="space-y-2">
                <Label>Volunteer</Label>
                <Select
                  value={newMessage.volunteer_id}
                  onValueChange={(v) =>
                    setNewMessage({ ...newMessage, volunteer_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a volunteer" />
                  </SelectTrigger>
                  <SelectContent>
                    {volunteers.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Type your message... Use {name}, {duty}, {drive_name} for templates"
                value={newMessage.message}
                onChange={(e) =>
                  setNewMessage({ ...newMessage, message: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label>Scheduled Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={newMessage.scheduled_at}
                  onChange={(e) =>
                    setNewMessage({ ...newMessage, scheduled_at: e.target.value })
                  }
                />
              </div>
              <Button onClick={createScheduledMessage} disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="mr-2 h-4 w-4" />
                )}
                Schedule
              </Button>
            </div>
          </div>

          {/* Messages table */}
          {scheduledMessages.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledMessages.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell className="text-sm">
                        {msg.group_jid ? (
                          <span className="text-muted-foreground">Group</span>
                        ) : msg.volunteers ? (
                          <span>{(msg.volunteers as any).name}</span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                        {msg.drives && (
                          <p className="text-xs text-muted-foreground">
                            {(msg.drives as any).name}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {msg.message}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(msg.scheduled_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {msg.status === "pending" ? (
                          <Badge variant="warning" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Pending
                          </Badge>
                        ) : msg.status === "sent" ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Sent
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {msg.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => cancelScheduledMessage(msg.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No scheduled messages yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
