"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonTableRow } from "@/components/ui/skeleton-table";
import { formatPhone, cn } from "@/lib/utils";
import { getStatusBadgeVariant } from "@/lib/utils";
import {
  Check,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type Assignment = {
  id: string;
  volunteer_id: string;
  duty_id: string;
  status: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
  message_sent_override: boolean | null;
  message_acknowledged_override: boolean | null;
  volunteers: { name: string; phone: string } | null;
  duties: { name: string } | null;
};

type DriveDuty = {
  id: string;
  duty_id: string;
  duties: { name: string; gender_restriction: string | null } | null;
};

const ACK_STATUSES = ["confirmed", "en_route", "arrived", "completed"];

function StatusCell({
  value,
  override,
  onOverride,
}: {
  value: boolean;
  override: boolean | null;
  onOverride: (v: boolean | null) => void;
}) {
  const displayValue = override !== null ? override : value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 gap-1.5 font-normal",
            displayValue
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          )}
        >
          {displayValue ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span className="capitalize">{displayValue ? "Yes" : "No"}</span>
          {override !== null && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              (override)
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onOverride(null)}>
          Auto ({value ? "Yes" : "No"})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOverride(true)}>
          Mark as Yes
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOverride(false)}>
          Mark as No
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function VolunteersPage() {
  const { id: driveId } = useParams<{ id: string }>();
  const supabase = createClient();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [driveDuties, setDriveDuties] = useState<DriveDuty[]>([]);
  const [messageSentVolunteerIds, setMessageSentVolunteerIds] = useState<
    Set<string>
  >(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingDuty, setSavingDuty] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState<string | null>(null);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("volunteers-view")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assignments",
          filter: `drive_id=eq.${driveId}`,
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driveId]);

  async function loadData() {
    const [assignRes, dutiesRes, commRes] = await Promise.all([
      supabase
        .from("assignments")
        .select("id, volunteer_id, duty_id, status, confirmed_at, checked_in_at, message_sent_override, message_acknowledged_override, volunteers(name, phone), duties(name)")
        .eq("drive_id", driveId)
        .neq("status", "waitlisted")
        .order("created_at"),
      supabase
        .from("drive_duties")
        .select("id, duty_id, duties(name, gender_restriction)")
        .eq("drive_id", driveId)
        .order("created_at"),
      supabase
        .from("communication_log")
        .select("volunteer_id")
        .eq("drive_id", driveId)
        .eq("direction", "outbound")
        .eq("channel", "whatsapp"),
    ]);

    if (assignRes.data) setAssignments(assignRes.data as unknown as Assignment[]);
    if (dutiesRes.data) setDriveDuties(dutiesRes.data as unknown as DriveDuty[]);
    if (commRes.data) {
      setMessageSentVolunteerIds(
        new Set(commRes.data.map((r) => r.volunteer_id))
      );
    }
    setLoading(false);
    setRefreshing(false);
  }

  async function handleDutyChange(assignmentId: string, newDutyId: string) {
    // Validate gender restriction before reassigning
    const assignment = assignments.find((a) => a.id === assignmentId);
    const targetDuty = driveDuties.find((dd) => dd.duty_id === newDutyId);
    const genderRestriction = targetDuty?.duties?.gender_restriction;

    if (genderRestriction && assignment?.volunteers) {
      // Look up volunteer gender
      const { data: vol } = await supabase
        .from("volunteers")
        .select("gender")
        .eq("id", assignment.volunteer_id)
        .single();

      if (vol && genderRestriction !== vol.gender) {
        toast.error(
          `Cannot assign to ${targetDuty?.duties?.name} — restricted to ${genderRestriction} volunteers`,
        );
        return;
      }
    }

    setSavingDuty(assignmentId);
    const { error } = await supabase
      .from("assignments")
      .update({ duty_id: newDutyId, is_manual_override: true })
      .eq("id", assignmentId);
    setSavingDuty(null);
    if (error) {
      toast.error("Failed to update duty");
    } else {
      toast.success("Duty updated");
      loadData();
    }
  }

  async function handleOverride(
    assignmentId: string,
    field: "message_sent_override" | "message_acknowledged_override",
    value: boolean | null
  ) {
    setSavingOverride(assignmentId);
    const { error } = await supabase
      .from("assignments")
      .update({ [field]: value })
      .eq("id", assignmentId);
    setSavingOverride(null);
    if (error) {
      toast.error("Failed to update override");
    } else {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId ? { ...a, [field]: value } : a
        )
      );
    }
  }

  function getMessageSent(a: Assignment): boolean {
    if (a.message_sent_override !== null) return a.message_sent_override;
    return messageSentVolunteerIds.has(a.volunteer_id);
  }

  function getMessageAcknowledged(a: Assignment): boolean {
    if (a.message_acknowledged_override !== null)
      return a.message_acknowledged_override;
    return ACK_STATUSES.includes(a.status) || a.confirmed_at != null;
  }

  if (loading) {
    return (
      <div className="space-y-4 page-fade-in">
        <div className="flex justify-between">
          <SkeletonTableRow columns={6} />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Duty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Msg Sent</TableHead>
                <TableHead>Ack</TableHead>
                <TableHead>Present</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={7} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 page-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {assignments.length} volunteer{assignments.length !== 1 ? "s" : ""}{" "}
          assigned. Message Sent and Acknowledged are auto-derived from
          WhatsApp; click to override.
        </p>
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
            className={cn("mr-1.5 h-4 w-4", refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Duty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Message Sent</TableHead>
              <TableHead>Message Ack</TableHead>
              <TableHead>Present</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((a) => {
              const { variant } = getStatusBadgeVariant(a.status);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.volunteers?.name ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {a.volunteers?.phone
                      ? formatPhone(a.volunteers.phone)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={a.duty_id}
                      onValueChange={(v) => handleDutyChange(a.id, v)}
                      disabled={savingDuty === a.id}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-8 w-[140px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {driveDuties.map((dd) => (
                          <SelectItem
                            key={dd.id}
                            value={dd.duty_id}
                          >
                            {dd.duties?.name ?? dd.duty_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={variant} className="text-xs">
                      {a.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusCell
                      value={getMessageSent(a)}
                      override={a.message_sent_override}
                      onOverride={(v) =>
                        handleOverride(a.id, "message_sent_override", v)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <StatusCell
                      value={getMessageAcknowledged(a)}
                      override={a.message_acknowledged_override}
                      onOverride={(v) =>
                        handleOverride(
                          a.id,
                          "message_acknowledged_override",
                          v
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {a.checked_in_at ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-4 w-4" />
                        Yes
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
    </div>
  );
}
