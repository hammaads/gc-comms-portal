"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { DriveDetailSkeleton } from "@/components/skeletons/drive-detail-skeleton";
import { formatDate, formatTime } from "@/lib/utils";
import { MapPin, Calendar, Utensils, Sun, LayoutGrid, Radio, Bell, Phone } from "lucide-react";
import { DriveStatusControl } from "./drive-status-control";

export function DriveDetailContent({ id }: { id: string }) {
  const supabase = createClient();
  const [drive, setDrive] = useState<any>(null);
  const [driveDuties, setDriveDuties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: driveData } = await supabase
        .from("drives")
        .select("*, seasons(name)")
        .eq("id", id)
        .single();

      if (driveData) setDrive(driveData);

      const { data: dutiesData } = await supabase
        .from("drive_duties")
        .select("*, duties(name, slug, gender_restriction)")
        .eq("drive_id", id)
        .order("created_at");

      if (dutiesData) setDriveDuties(dutiesData);

      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return <DriveDetailSkeleton />;
  }

  if (!drive) {
    return <div className="py-12 text-center">Drive not found</div>;
  }

  const totalCapacity =
    driveDuties.reduce(
      (sum, dd) => sum + (dd.manual_capacity_override ?? dd.calculated_capacity),
      0,
    );
  const totalAssigned = driveDuties.reduce(
    (sum, dd) => sum + dd.current_assigned,
    0,
  );

  const statCards = [
    { icon: Calendar, label: "Date", value: formatDate(drive.drive_date), color: "bg-primary/10 text-primary" },
    { icon: Sun, label: "Sunset", value: formatTime(drive.sunset_time), color: "bg-amber-500/10 text-amber-600" },
    { icon: Utensils, label: "Daigs", value: drive.daig_count, color: "bg-accent/10 text-accent" },
    { icon: MapPin, label: "Volunteers", value: `${totalAssigned}/${totalCapacity}`, color: "bg-blue-500/10 text-blue-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{drive.name}</h1>
            <StatusBadge status={drive.status} />
          </div>
          <p className="text-muted-foreground mt-1">
            {drive.seasons?.name}
          </p>
        </div>
        <DriveStatusControl driveId={drive.id} currentStatus={drive.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <p className="mt-2 font-medium">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {drive.location_name && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {drive.location_name}
          {drive.location_address && ` — ${drive.location_address}`}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/drives/${id}/assignments`}>
          <Button>
            <LayoutGrid className="mr-2 h-4 w-4" />
            Duty Board
          </Button>
        </Link>
        <Link href={`/drives/${id}/live`}>
          <Button variant="outline">
            <Radio className="mr-2 h-4 w-4" />
            Live Dashboard
          </Button>
        </Link>
        <Link href={`/drives/${id}/reminders`}>
          <Button variant="outline">
            <Bell className="mr-2 h-4 w-4" />
            Reminders
          </Button>
        </Link>
        <Link href={`/drives/${id}/calls`}>
          <Button variant="outline">
            <Phone className="mr-2 h-4 w-4" />
            Call Center
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Duty Capacity Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {driveDuties.map((dd) => {
              const capacity =
                dd.manual_capacity_override ?? dd.calculated_capacity;
              const pct =
                capacity > 0
                  ? Math.round((dd.current_assigned / capacity) * 100)
                  : 0;
              const duty = dd.duties;

              return (
                <div key={dd.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">
                      {duty?.name}
                      {duty?.gender_restriction && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {duty.gender_restriction}
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {dd.current_assigned}/{capacity}
                    </span>
                  </div>
                  <Progress value={Math.min(pct, 100)} className="h-2" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
