"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Phone, PhoneCall } from "lucide-react";
import { formatPhone } from "@/lib/utils";

type CallEntry = {
  id: string;
  volunteer_id: string;
  assignment_status: string;
  volunteer_name: string;
  volunteer_phone: string;
  duty_name: string;
  last_call_result: string | null;
  last_call_duration: number | null;
};

export function CallCenterContent({ driveId }: { driveId: string }) {
  const supabase = createClient();
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("call-center")
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
      supabase.removeChannel(channel);
    };
  }, [driveId]);

  async function loadData() {
    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, volunteer_id, status, duty_id, volunteers(name, phone), duties(name)")
      .eq("drive_id", driveId)
      .neq("status", "waitlisted")
      .neq("status", "cancelled");

    if (!assignments) {
      setLoading(false);
      return;
    }

    const { data: calls } = await supabase
      .from("communication_log")
      .select("volunteer_id, call_result, call_duration_seconds")
      .eq("drive_id", driveId)
      .eq("channel", "ai_call")
      .order("created_at", { ascending: false });

    const callMap: Record<
      string,
      { result: string | null; duration: number | null }
    > = {};
    calls?.forEach((c) => {
      if (!callMap[c.volunteer_id]) {
        callMap[c.volunteer_id] = {
          result: c.call_result,
          duration: c.call_duration_seconds,
        };
      }
    });

    const mapped: CallEntry[] = assignments.map((a) => ({
      id: a.id,
      volunteer_id: a.volunteer_id,
      assignment_status: a.status,
      volunteer_name: (a.volunteers as any)?.name || "",
      volunteer_phone: (a.volunteers as any)?.phone || "",
      duty_name: (a.duties as any)?.name || "",
      last_call_result: callMap[a.volunteer_id]?.result || null,
      last_call_duration: callMap[a.volunteer_id]?.duration || null,
    }));

    setEntries(mapped);
    setLoading(false);
  }

  function toggleSelect(volunteerId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(volunteerId)) next.delete(volunteerId);
      else next.add(volunteerId);
      return next;
    });
  }

  function selectAllUnconfirmed() {
    const unconfirmed = entries.filter(
      (e) => e.assignment_status === "assigned",
    );
    setSelected(new Set(unconfirmed.map((e) => e.volunteer_id)));
  }

  async function triggerCalls() {
    if (selected.size === 0) {
      toast.error("No volunteers selected");
      return;
    }
    setCalling(true);

    const res = await fetch("/api/calls/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveId,
        volunteerIds: Array.from(selected),
      }),
    });

    setCalling(false);
    const data = await res.json();
    if (data.error) {
      toast.error(data.error);
    } else {
      toast.success(`Initiated calls to ${selected.size} volunteers`);
      setSelected(new Set());
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Call Center</h1>
          <p className="text-muted-foreground">
            AI phone calls to confirm volunteer attendance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={selectAllUnconfirmed}>
            Select Unconfirmed
          </Button>
          <Button onClick={triggerCalls} disabled={calling || selected.size === 0}>
            {calling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Calling...
              </>
            ) : (
              <>
                <PhoneCall className="mr-2 h-4 w-4" />
                Call Selected ({selected.size})
              </>
            )}
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="No Volunteers to Call"
          description="Assign volunteers to this drive first, then use the call center to confirm attendance."
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Volunteer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Duty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Call</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(e.volunteer_id)}
                        onCheckedChange={() => toggleSelect(e.volunteer_id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {e.volunteer_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatPhone(e.volunteer_phone)}
                    </TableCell>
                    <TableCell>{e.duty_name}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.assignment_status} />
                    </TableCell>
                    <TableCell>
                      {e.last_call_result ? (
                        <Badge variant="outline">
                          {e.last_call_result.replace("_", " ")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {e.last_call_duration
                        ? `${e.last_call_duration}s`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
