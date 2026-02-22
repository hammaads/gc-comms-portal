"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatPhone, formatTime, cn } from "@/lib/utils";
import {
  Loader2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Minus,
  RefreshCw,
  MessageCircle,
  Plus,
  Send,
  XCircle,
  ChevronDown,
  History,
} from "lucide-react";
import type { Tables } from "@/lib/supabase/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type Assignment = {
  id: string;
  volunteer_id: string;
  duty_id: string;
  status: string;
  volunteers: { id: string; name: string; phone: string } | null;
  duties: { name: string } | null;
};

type CommLog = {
  id: string;
  volunteer_id: string;
  drive_id: string | null;
  direction: string;
  content: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
};

type DriveInfo = {
  name: string;
  location_name: string | null;
  sunset_time: string | null;
};

// ─── Delivery Status Badge ───────────────────────────────────────────────────

function DeliveryStatusBadge({
  logs,
  reminder,
}: {
  logs: CommLog[];
  reminder: Tables<"reminder_schedules"> | null;
}) {
  const outboundLog = logs.findLast((l) => l.direction === "outbound");

  if (outboundLog?.error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          >
            <AlertCircle className="h-3 w-3" />
            Failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{outboundLog.error}</TooltipContent>
      </Tooltip>
    );
  }

  if (outboundLog) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-3 w-3" />
            Sent
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Sent at{" "}
          {outboundLog.sent_at
            ? new Date(outboundLog.sent_at).toLocaleTimeString("en-PK", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "unknown"}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (reminder && !reminder.is_sent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          >
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Reminder scheduled
          {reminder.scheduled_at &&
            ` for ${new Date(reminder.scheduled_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}`}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1 border-border text-muted-foreground"
    >
      <Minus className="h-3 w-3" />
      No reminder
    </Badge>
  );
}

// ─── Reminder Card ───────────────────────────────────────────────────────────

function ReminderCard({
  reminder,
  onCreated,
  onSaved,
  onDeleted,
  driveId,
  sunsetTime,
}: {
  reminder: Tables<"reminder_schedules"> | null;
  onCreated: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  driveId: string;
  sunsetTime: string | null;
}) {
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [hours, setHours] = useState(reminder?.hours_before_sunset ?? 2);
  const [template, setTemplate] = useState(reminder?.message_template ?? "");

  useEffect(() => {
    setHours(reminder?.hours_before_sunset ?? 2);
    setTemplate(reminder?.message_template ?? "");
  }, [reminder]);

  async function handleCreate() {
    setCreating(true);
    const { error } = await supabase.from("reminder_schedules").insert({
      drive_id: driveId,
      reminder_type: "custom",
      hours_before_sunset: 2,
      message_template:
        "Reminder: {name}, you are assigned to {duty} for {drive_name} at {location}. Sunset at {sunset_time}.",
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
    } else {
      onCreated();
    }
  }

  async function handleSave() {
    if (!reminder) return;
    setSaveState("saving");
    setSaving(true);
    const { error } = await supabase
      .from("reminder_schedules")
      .update({
        hours_before_sunset: hours,
        message_template: template,
      })
      .eq("id", reminder.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      setSaveState("idle");
    } else {
      setSaveState("saved");
      onSaved();
      setTimeout(() => setSaveState("idle"), 1500);
    }
  }

  async function handleDelete() {
    if (!reminder) return;
    toast("Delete this reminder?", {
      action: {
        label: "Delete",
        onClick: async () => {
          await supabase
            .from("reminder_schedules")
            .delete()
            .eq("id", reminder.id);
          onDeleted();
        },
      },
    });
  }

  if (!reminder) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Button onClick={handleCreate} disabled={creating} size="lg">
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Set Up Reminder
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isReadOnly = reminder.is_sent;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.5"
              min={0}
              className="h-8 w-16 text-center text-sm"
              value={hours}
              onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
              disabled={isReadOnly}
            />
            <span className="text-sm text-muted-foreground">
              hours before sunset
            </span>
            {sunsetTime && hours > 0 && (() => {
              const [h, m] = sunsetTime.split(":").map(Number);
              const sunsetMinutes = h * 60 + m;
              const sendMinutes = sunsetMinutes - hours * 60;
              if (sendMinutes < 0) return null;
              const sendH = Math.floor(sendMinutes / 60);
              const sendM = Math.round(sendMinutes % 60);
              const ampm = sendH >= 12 ? "PM" : "AM";
              const h12 = sendH % 12 || 12;
              return (
                <span className="text-sm font-medium text-foreground">
                  = {h12}:{String(sendM).padStart(2, "0")} {ampm}
                </span>
              );
            })()}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isReadOnly && (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-3 w-3" />
                Sent
                {reminder.sent_at &&
                  ` at ${new Date(reminder.sent_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}`}
              </Badge>
            )}
            {!isReadOnly && (
              <>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saveState === "saving" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {saveState === "saved" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  )}
                  {saveState === "saving"
                    ? "Saving..."
                    : saveState === "saved"
                      ? "Saved!"
                      : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
        <Textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={3}
          className="resize-none font-mono text-sm"
          placeholder="Message template..."
          disabled={isReadOnly}
        />
        <p className="text-xs text-muted-foreground">
          Variables:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            {"{name}"}, {"{duty}"}, {"{drive_name}"}, {"{location}"},{" "}
            {"{sunset_time}"}
          </code>
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Delivery Summary Bar ────────────────────────────────────────────────────

function DeliverySummaryBar({
  sent,
  pending,
  failed,
}: {
  sent: number;
  pending: number;
  failed: number;
}) {
  const total = sent + pending + failed;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-medium tabular-nums">
          {sent}/{total}
        </span>
        <span className="text-muted-foreground">Sent</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="font-medium tabular-nums">{pending}</span>
        <span className="text-muted-foreground">Pending</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        <span className="font-medium tabular-nums">{failed}</span>
        <span className="text-muted-foreground">Failed</span>
      </div>
    </div>
  );
}

// ─── Chat Sheet ──────────────────────────────────────────────────────────────

function ChatSheet({
  open,
  onOpenChange,
  volunteer,
  driveId,
  assignmentId,
  assignmentStatus,
  reminder,
  onMessageSent,
  onAssignmentCancelled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volunteer: { id: string; name: string; phone: string } | null;
  driveId: string;
  assignmentId: string | null;
  assignmentStatus: string | null;
  reminder: Tables<"reminder_schedules"> | null;
  onMessageSent: () => void;
  onAssignmentCancelled: () => void;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<CommLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [composing, setComposing] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showOlderMessages, setShowOlderMessages] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !volunteer) {
      setMessages([]);
      setComposing("");
      return;
    }

    setLoading(true);
    supabase
      .from("communication_log")
      .select("id, drive_id, direction, content, sent_at, error, created_at")
      .eq("volunteer_id", volunteer.id)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as CommLog[]);
        setLoading(false);
      });
  }, [open, volunteer?.id]);

  useEffect(() => {
    // Scroll to bottom when messages load or change
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, loading]);

  async function handleSend() {
    if (!composing.trim() || !volunteer) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: volunteer.phone,
          message: composing.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send message");
        setSending(false);
        return;
      }

      // Log the message to communication_log
      const { error: logError } = await supabase
        .from("communication_log")
        .insert({
          volunteer_id: volunteer.id,
          drive_id: driveId,
          channel: "whatsapp",
          direction: "outbound",
          content: composing.trim(),
          sent_at: new Date().toISOString(),
        });

      if (logError) {
        toast.warning("Message sent but failed to log — it may not appear in history");
      }

      setComposing("");
      onMessageSent();

      // Reload chat messages
      const { data: refreshed } = await supabase
        .from("communication_log")
        .select("id, drive_id, direction, content, sent_at, error, created_at")
        .eq("volunteer_id", volunteer.id)
        .eq("channel", "whatsapp")
        .order("created_at", { ascending: true });
      if (refreshed) setMessages(refreshed as CommLog[]);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    if (!assignmentId) return;
    setCancelling(true);
    const { error } = await supabase
      .from("assignments")
      .update({ status: "cancelled" })
      .eq("id", assignmentId);
    if (error) {
      toast.error("Failed to cancel assignment");
      setCancelling(false);
      return;
    }
    toast.success("Assignment cancelled");

    // Auto-promote next waitlisted volunteer
    try {
      await fetch("/api/assignments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveId }),
      });
    } catch {
      // Non-critical — promotion can be done manually
    }

    setCancelling(false);
    onAssignmentCancelled();
  }

  // Group messages by date for date separators
  function getDateLabel(dateStr: string): string {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-PK", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-[480px]"
      >
        <SheetHeader className="border-b pb-3">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>{volunteer?.name ?? "Volunteer"}</SheetTitle>
              <SheetDescription>
                {volunteer?.phone ? formatPhone(volunteer.phone) : ""}
              </SheetDescription>
            </div>
            {assignmentStatus && assignmentStatus !== "cancelled" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {cancelling ? "Cancelling..." : "Cancel Assignment"}
              </Button>
            )}
            {assignmentStatus === "cancelled" && (
              <Badge
                variant="outline"
                className="gap-1 border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              >
                <XCircle className="h-3 w-3" />
                Cancelled
              </Badge>
            )}
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (() => {
          const thisDriveMessages = messages.filter((m) => m.drive_id === driveId);
          const olderMessages = messages.filter((m) => m.drive_id !== driveId);

          return (
          <div className="flex-1 overflow-y-auto px-4">
            <div className="space-y-1.5 py-3">
              {/* Collapsible older messages from other drives */}
              {olderMessages.length > 0 && (
                <div>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 py-2 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                    onClick={() => setShowOlderMessages((p) => !p)}
                  >
                    <div className="h-px flex-1 bg-border" />
                    <span className="flex items-center gap-1">
                      <History className="h-3 w-3" />
                      {olderMessages.length} older message{olderMessages.length !== 1 ? "s" : ""} from other drives
                      <ChevronDown className={cn("h-3 w-3 transition-transform", showOlderMessages && "rotate-180")} />
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </button>
                  {showOlderMessages && (
                    <div className="space-y-1.5 opacity-90">
                      {olderMessages.map((msg, i) => {
                        const isOutbound = msg.direction === "outbound";
                        const prevMsg = i > 0 ? olderMessages[i - 1] : null;
                        const showDateSep =
                          !prevMsg ||
                          getDateLabel(msg.sent_at || msg.created_at) !==
                            getDateLabel(prevMsg.sent_at || prevMsg.created_at);

                        return (
                          <div key={msg.id}>
                            {showDateSep && (
                              <div className="flex items-center justify-center py-2">
                                <span className="rounded-full bg-muted px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {getDateLabel(msg.sent_at || msg.created_at)}
                                </span>
                              </div>
                            )}
                            <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
                              <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", isOutbound ? "rounded-br-sm bg-muted text-muted-foreground" : "rounded-bl-sm bg-muted")}>
                                <p className="whitespace-pre-wrap break-words">{msg.content || "(no content)"}</p>
                                <div className={cn("mt-1 text-[10px]", isOutbound ? "text-right" : "", "text-muted-foreground/60")}>
                                  {new Date(msg.sent_at || msg.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* This drive divider */}
              <div className="flex items-center gap-2 py-3">
                <div className="h-px flex-1 bg-border" />
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  reminder?.sent_at
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
                )}>
                  {reminder?.sent_at ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Reminder sent · {new Date(reminder.sent_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
                    </>
                  ) : reminder && !reminder.is_sent ? (
                    <>
                      <Clock className="h-3 w-3" />
                      Reminder not sent yet
                    </>
                  ) : (
                    <>
                      <MessageCircle className="h-3 w-3" />
                      This drive
                    </>
                  )}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* This drive messages */}
              {thisDriveMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 py-8 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 opacity-40" />
                  <p className="text-xs">No messages for this drive yet</p>
                </div>
              ) : (
                thisDriveMessages.map((msg, i) => {
                  const isOutbound = msg.direction === "outbound";
                  const prevMsg = i > 0 ? thisDriveMessages[i - 1] : null;
                  const showDateSep =
                    !prevMsg ||
                    getDateLabel(msg.sent_at || msg.created_at) !==
                      getDateLabel(prevMsg.sent_at || prevMsg.created_at);

                  return (
                    <div key={msg.id}>
                      {showDateSep && (
                        <div className="flex items-center justify-center py-2">
                          <span className="rounded-full bg-muted px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {getDateLabel(msg.sent_at || msg.created_at)}
                          </span>
                        </div>
                      )}
                      <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                            isOutbound
                              ? "rounded-br-sm bg-emerald-600 text-white dark:bg-emerald-700"
                              : "rounded-bl-sm bg-muted",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {msg.content || "(no content)"}
                          </p>
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-1 text-[10px]",
                              isOutbound
                                ? "justify-end text-emerald-200"
                                : "text-muted-foreground",
                            )}
                          >
                            <span>
                              {new Date(msg.sent_at || msg.created_at).toLocaleTimeString("en-PK", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {msg.error && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertCircle className="h-3 w-3 text-red-400" />
                                </TooltipTrigger>
                                <TooltipContent>{msg.error}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          );
        })()}

        {/* Compose area */}
        <div className="border-t p-3">
          <p className="mb-2 text-[10px] text-muted-foreground">
            Only messages sent through this system are shown
          </p>
          <div className="flex items-end gap-2">
            <Textarea
              value={composing}
              onChange={(e) => setComposing(e.target.value)}
              placeholder="Type a message..."
              rows={2}
              className="min-h-[40px] flex-1 resize-none text-sm"
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || !composing.trim()}
              className="h-10 w-10 shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main WhatsApp Page ──────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const { id: driveId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [reminder, setReminder] = useState<Tables<"reminder_schedules"> | null>(
    null,
  );
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [commLogs, setCommLogs] = useState<CommLog[]>([]);
  const [driveInfo, setDriveInfo] = useState<DriveInfo | null>(null);

  const [selectedVolunteer, setSelectedVolunteer] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedAssignmentStatus, setSelectedAssignmentStatus] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [reminderRes, assignRes, commRes, driveRes] = await Promise.all([
        supabase
          .from("reminder_schedules")
          .select("*")
          .eq("drive_id", driveId)
          .order("created_at")
          .limit(1),
        supabase
          .from("assignments")
          .select(
            "id, volunteer_id, duty_id, status, volunteers(id, name, phone), duties(name)",
          )
          .eq("drive_id", driveId)
          .neq("status", "waitlisted")
          .order("created_at"),
        supabase
          .from("communication_log")
          .select("id, volunteer_id, drive_id, direction, content, sent_at, error, created_at")
          .eq("drive_id", driveId)
          .eq("channel", "whatsapp")
          .order("created_at"),
        supabase
          .from("drives")
          .select("name, location_name, sunset_time")
          .eq("id", driveId)
          .single(),
      ]);

      if (reminderRes.error) throw reminderRes.error;
      if (assignRes.error) throw assignRes.error;
      if (commRes.error) throw commRes.error;
      if (driveRes.error) throw driveRes.error;

      setReminder(reminderRes.data?.[0] ?? null);
      setAssignments(assignRes.data as unknown as Assignment[]);
      setCommLogs(commRes.data as CommLog[]);
      setDriveInfo(driveRes.data as DriveInfo);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driveId]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("whatsapp-drive")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_log",
          filter: `drive_id=eq.${driveId}`,
        },
        () => loadData(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driveId, loadData]);

  // Compute delivery stats
  function getVolunteerLogs(volunteerId: string) {
    return commLogs.filter((l) => l.volunteer_id === volunteerId);
  }

  const stats = assignments.reduce(
    (acc, a) => {
      if (a.status === "cancelled") return acc;
      const logs = getVolunteerLogs(a.volunteer_id);
      const outbound = logs.findLast((l) => l.direction === "outbound");
      if (outbound?.error) {
        acc.failed++;
      } else if (outbound) {
        acc.sent++;
      } else if (reminder && !reminder.is_sent) {
        acc.pending++;
      }
      return acc;
    },
    { sent: 0, pending: 0, failed: 0 },
  );

  function interpolateTemplate(
    tpl: string,
    assignment: Assignment,
  ): string {
    if (!driveInfo) return tpl;
    return tpl
      .replaceAll("{name}", assignment.volunteers?.name ?? "")
      .replaceAll("{duty}", assignment.duties?.name ?? "")
      .replaceAll("{drive_name}", driveInfo.name)
      .replaceAll("{location}", driveInfo.location_name ?? "")
      .replaceAll("{sunset_time}", formatTime(driveInfo.sunset_time));
  }

  function getMessagePreview(assignment: Assignment): string {
    const logs = getVolunteerLogs(assignment.volunteer_id);
    const outbound = logs.findLast((l) => l.direction === "outbound");
    if (outbound?.content) return outbound.content;
    if (reminder?.message_template) {
      return interpolateTemplate(reminder.message_template, assignment);
    }
    return "";
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 page-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="page-fade-in">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading WhatsApp data</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setError(null);
                loadData();
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-5 page-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">WhatsApp</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn(
                "mr-1.5 h-4 w-4",
                refreshing && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>

        {/* Section 1: Reminder Setup */}
        <ReminderCard
          reminder={reminder}
          onCreated={loadData}
          onSaved={loadData}
          onDeleted={loadData}
          driveId={driveId}
          sunsetTime={driveInfo?.sunset_time ?? null}
        />

        {/* Section 2: Delivery Summary */}
        {assignments.length > 0 && (
          <DeliverySummaryBar
            sent={stats.sent}
            pending={stats.pending}
            failed={stats.failed}
          />
        )}

        {/* Section 3: Delivery Table */}
        {assignments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">👥</span>
                <p className="text-base font-medium">
                  No volunteers assigned yet
                </p>
                <p className="text-sm">
                  Use the Duty Board to assign volunteers to this drive
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Duty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Message
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const logs = getVolunteerLogs(a.volunteer_id);
                  const outbound = logs.findLast(
                    (l) => l.direction === "outbound",
                  );
                  const preview = getMessagePreview(a);
                  const isPreview = !outbound?.content;

                  return (
                    <TableRow
                      key={a.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        a.status === "cancelled" && "opacity-50",
                      )}
                      onClick={() => {
                        if (a.volunteers) {
                          setSelectedVolunteer({
                            id: a.volunteers.id,
                            name: a.volunteers.name,
                            phone: a.volunteers.phone,
                          });
                          setSelectedAssignmentId(a.id);
                          setSelectedAssignmentStatus(a.status);
                          setChatOpen(true);
                        }
                      }}
                    >
                      <TableCell className={cn("font-medium", a.status === "cancelled" && "line-through")}>
                        {a.volunteers?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.duties?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {a.status === "cancelled" ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                          >
                            <XCircle className="h-3 w-3" />
                            Cancelled
                          </Badge>
                        ) : (
                          <DeliveryStatusBadge
                            logs={logs}
                            reminder={reminder}
                          />
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[300px] truncate sm:table-cell">
                        {preview ? (
                          <span
                            className={cn(
                              "text-sm",
                              isPreview
                                ? "italic text-muted-foreground"
                                : "text-foreground",
                            )}
                          >
                            {preview}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Section 4: Chat Sheet */}
        <ChatSheet
          open={chatOpen}
          onOpenChange={setChatOpen}
          volunteer={selectedVolunteer}
          driveId={driveId}
          assignmentId={selectedAssignmentId}
          assignmentStatus={selectedAssignmentStatus}
          reminder={reminder}
          onMessageSent={loadData}
          onAssignmentCancelled={() => {
            loadData();
            setChatOpen(false);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
