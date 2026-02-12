"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DrivesSkeleton } from "@/components/skeletons/drives-skeleton";
import { Plus, MapPin, Calendar, Utensils, CalendarDays } from "lucide-react";
import { formatDate, formatTime, getStatusDotColor } from "@/lib/utils";

type DriveWithDuties = {
  id: string;
  name: string;
  drive_date: string;
  location_name: string | null;
  daig_count: number;
  sunset_time: string | null;
  status: string;
  drive_duties: Array<{
    id: string;
    calculated_capacity: number;
    manual_capacity_override: number | null;
    current_assigned: number;
  }>;
};

export default function DrivesPage() {
  const supabase = createClient();
  const [drives, setDrives] = useState<DriveWithDuties[]>([]);
  const [loading, setLoading] = useState(true);
  const [noSeason, setNoSeason] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("id")
        .eq("is_active", true)
        .single();

      if (!activeSeason) {
        setNoSeason(true);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("drives")
        .select(
          `*, drive_duties(id, calculated_capacity, manual_capacity_override, current_assigned)`,
        )
        .eq("season_id", activeSeason.id)
        .order("drive_date", { ascending: true });

      if (data) setDrives(data as unknown as DriveWithDuties[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <DrivesSkeleton />;
  }

  if (noSeason) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No Active Season"
        description="Create a season in Settings to get started."
        actionLabel="Go to Settings"
        actionHref="/settings/general"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Iftaar Drives</h1>
          <p className="text-muted-foreground">
            Manage all iftaar drives for the current season
          </p>
        </div>
        <Link href="/drives/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Drive
          </Button>
        </Link>
      </div>

      {drives.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No Drives Yet"
          description="No drives yet for this season. Create your first drive to get started."
          actionLabel="Create Your First Drive"
          actionHref="/drives/new"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {drives.map((drive) => {
            const totalCapacity =
              drive.drive_duties?.reduce(
                (sum, dd) =>
                  sum + (dd.manual_capacity_override ?? dd.calculated_capacity),
                0,
              ) || 0;
            const totalAssigned =
              drive.drive_duties?.reduce(
                (sum, dd) => sum + dd.current_assigned,
                0,
              ) || 0;
            const fillPercent =
              totalCapacity > 0
                ? Math.round((totalAssigned / totalCapacity) * 100)
                : 0;

            return (
              <Link key={drive.id} href={`/drives/${drive.id}`}>
                <Card className="group cursor-pointer border-l-4 hover:border-primary/30" style={{ borderLeftColor: `hsl(var(--status-${drive.status}-dot))` }}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{drive.name}</CardTitle>
                      <StatusBadge status={drive.status} />
                    </div>
                    <CardDescription className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(drive.drive_date)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {drive.location_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {drive.location_name}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <Utensils className="h-3 w-3" />
                        {drive.daig_count} daigs
                      </span>
                      {drive.sunset_time && (
                        <span>Sunset: {formatTime(drive.sunset_time)}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>
                          {totalAssigned}/{totalCapacity} volunteers
                        </span>
                        <span>{fillPercent}%</span>
                      </div>
                      <Progress value={fillPercent} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
