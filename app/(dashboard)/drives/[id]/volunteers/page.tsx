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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonTableRow } from "@/components/ui/skeleton-table";
import { formatPhone, cn } from "@/lib/utils";
import { getStatusBadgeVariant } from "@/lib/utils";
import {
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type Assignment = {
  id: string;
  volunteer_id: string;
  duty_id: string;
  status: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
  volunteers: { name: string; phone: string } | null;
  duties: { name: string } | null;
};

type DriveDuty = {
  id: string;
  duty_id: string;
  duties: { name: string; gender_restriction: string | null } | null;
};

export default function VolunteersPage() {
  const { id: driveId } = useParams<{ id: string }>();
  const supabase = createClient();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [driveDuties, setDriveDuties] = useState<DriveDuty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingDuty, setSavingDuty] = useState<string | null>(null);

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
    const [assignRes, dutiesRes] = await Promise.all([
      supabase
        .from("assignments")
        .select("id, volunteer_id, duty_id, status, confirmed_at, checked_in_at, volunteers(name, phone), duties(name)")
        .eq("drive_id", driveId)
        .neq("status", "waitlisted")
        .order("created_at"),
      supabase
        .from("drive_duties")
        .select("id, duty_id, duties(name, gender_restriction)")
        .eq("drive_id", driveId)
        .order("created_at"),
    ]);

    if (assignRes.data) setAssignments(assignRes.data as unknown as Assignment[]);
    if (dutiesRes.data) setDriveDuties(dutiesRes.data as unknown as DriveDuty[]);
    setLoading(false);
    setRefreshing(false);
  }

  async function handleDutyChange(assignmentId: string, newDutyId: string) {
    const assignment = assignments.find((a) => a.id === assignmentId);
    const targetDuty = driveDuties.find((dd) => dd.duty_id === newDutyId);
    const genderRestriction = targetDuty?.duties?.gender_restriction;

    if (genderRestriction && assignment?.volunteers) {
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

  if (loading) {
    return (
      <div className="space-y-4 page-fade-in">
        <div className="flex justify-between">
          <SkeletonTableRow columns={5} />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Duty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Present</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={5} />
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
          assigned
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
              <TableHead>Phone</TableHead>
              <TableHead>Duty</TableHead>
              <TableHead>Status</TableHead>
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
