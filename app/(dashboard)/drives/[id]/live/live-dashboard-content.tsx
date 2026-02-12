"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { LiveDashboardSkeleton } from "@/components/skeletons/live-dashboard-skeleton";
import { formatPhone } from "@/lib/utils";
import { AlertTriangle, Radio, Users } from "lucide-react";

type AssignmentWithVolunteer = {
  id: string;
  status: string;
  duty_id: string;
  volunteers: { name: string; phone: string } | null;
  duties: { name: string } | null;
};

const STATUS_CARD_COLORS: Record<string, string> = {
  Total: "hsl(var(--status-assigned-dot))",
  Confirmed: "hsl(var(--status-confirmed-dot))",
  "En Route": "hsl(var(--status-en_route-dot))",
  Arrived: "hsl(var(--status-arrived-dot))",
  Cancelled: "hsl(var(--status-cancelled-dot))",
};

export function LiveDashboardContent({ driveId }: { driveId: string }) {
  const supabase = createClient();
  const [assignments, setAssignments] = useState<AssignmentWithVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deficitAlert, setDeficitAlert] = useState(false);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("live-dashboard")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assignments",
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
    const { data } = await supabase
      .from("assignments")
      .select("*, volunteers(name, phone), duties(name)")
      .eq("drive_id", driveId)
      .neq("status", "waitlisted")
      .order("created_at");

    if (data) {
      setAssignments(data as unknown as AssignmentWithVolunteer[]);
      const total = data.length;
      const problematic = data.filter(
        (a) =>
          a.status === "cancelled" ||
          a.status === "no_show" ||
          a.status === "assigned",
      ).length;
      setDeficitAlert(total > 0 && (problematic / total) * 100 > 20);
    }
    setLoading(false);
  }

  const statusCounts: Record<string, number> = {};
  assignments.forEach((a) => {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  });

  const total = assignments.length;
  const confirmed = statusCounts["confirmed"] || 0;
  const enRoute = statusCounts["en_route"] || 0;
  const arrived = statusCounts["arrived"] || 0;
  const cancelled = statusCounts["cancelled"] || 0;

  if (loading) {
    return <LiveDashboardSkeleton />;
  }

  const stats = [
    { label: "Total", value: total },
    { label: "Confirmed", value: confirmed },
    { label: "En Route", value: enRoute },
    { label: "Arrived", value: arrived },
    { label: "Cancelled", value: cancelled },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Radio className="h-5 w-5 text-red-500 animate-pulse" />
        <h1 className="text-2xl font-bold">Live Dashboard</h1>
      </div>

      {deficitAlert && (
        <Alert variant="destructive" className="border-l-4 border-l-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Volunteer Deficit Alert</AlertTitle>
          <AlertDescription>
            More than 20% of volunteers are unconfirmed or cancelled. Consider
            calling remaining volunteers or activating waitlist.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden">
            <div
              className="h-1"
              style={{ backgroundColor: STATUS_CARD_COLORS[stat.label] }}
            />
            <CardContent className="pt-6 text-center">
              <AnimatedCounter
                value={stat.value}
                className="text-2xl font-bold"
              />
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            All Volunteers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {a.volunteers?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.duties?.name}
                  </p>
                </div>
                <StatusBadge status={a.status} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
