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
  const outboundLog = logs.find((l) => l.direction === "outbound");

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
}: {
  reminder: Tables<"reminder_schedules"> | null;
  onCreated: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  driveId: string;
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volunteer: { id: string; name: string; phone: string } | null;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<CommLog[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !volunteer) {
      setMessages([]);
      return;
    }

    setLoading(true);
    supabase
      .from("communication_log")
      .select("id, direction, content, sent_at, error, created_at")
      .eq("volunteer_id", volunteer.id)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as CommLog[]);
        setLoading(false);
      });
  }, [open, volunteer?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{volunteer?.name ?? "Volunteer"}</SheetTitle>
          <SheetDescription>
            {volunteer?.phone ? formatPhone(volunteer.phone) : ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageCircle className="h-10 w-10" />
            <p className="text-sm font-medium">No messages yet</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            <div className="space-y-3 py-2">
              {messages.map((msg) => {
                const isOutbound = msg.direction === "outbound";
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      isOutbound ? "justify-end" : "justify-start",
                    )}
                  >
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
                          {new Date(
                            msg.sent_at || msg.created_at,
                          ).toLocaleTimeString("en-PK", {
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
                );
              })}
            </div>
          </ScrollArea>
        )}

        <SheetFooter>
          <p className="text-xs text-muted-foreground">
            Only messages sent through this system are shown
          </p>
        </SheetFooter>
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
          .select("id, volunteer_id, direction, content, sent_at, error, created_at")
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
      const logs = getVolunteerLogs(a.volunteer_id);
      const outbound = logs.find((l) => l.direction === "outbound");
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
      .replace("{name}", assignment.volunteers?.name ?? "")
      .replace("{duty}", assignment.duties?.name ?? "")
      .replace("{drive_name}", driveInfo.name)
      .replace("{location}", driveInfo.location_name ?? "")
      .replace("{sunset_time}", formatTime(driveInfo.sunset_time));
  }

  function getMessagePreview(assignment: Assignment): string {
    const logs = getVolunteerLogs(assignment.volunteer_id);
    const outbound = logs.find((l) => l.direction === "outbound");
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
                  const outbound = logs.find(
                    (l) => l.direction === "outbound",
                  );
                  const preview = getMessagePreview(a);
                  const isPreview = !outbound?.content;

                  return (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => {
                        if (a.volunteers) {
                          setSelectedVolunteer({
                            id: a.volunteers.id,
                            name: a.volunteers.name,
                            phone: a.volunteers.phone,
                          });
                          setChatOpen(true);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {a.volunteers?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.duties?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <DeliveryStatusBadge
                          logs={logs}
                          reminder={reminder}
                        />
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
        />
      </div>
    </TooltipProvider>
  );
}
