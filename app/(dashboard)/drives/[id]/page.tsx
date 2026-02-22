"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import posthog from "posthog-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatDate, formatTime, getStatusBadgeVariant } from "@/lib/utils";
import {
  MapPin,
  Calendar,
  Utensils,
  Sun,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  MoonStar,
  PlayCircle,
  XCircle,
  Users,
  Pencil,
  ExternalLink,
  LayoutGrid,
} from "lucide-react";
import { DriveStatusControl } from "./drive-status-control";
import { deleteDrive } from "../actions";
import { toast } from "sonner";
import AssignmentsPage from "./assignments/page";
import VolunteersPage from "./volunteers/page";
import LiveDashboardPage from "./live/page";
import WhatsAppPage from "./whatsapp/page";
import CallCenterPage from "./calls/page";

const LocationMap = dynamic(
  () =>
    import("@/components/dashboard/location-map").then(
      (m) => m.LocationMap,
    ),
  { ssr: false },
);

type DriveView = "overview" | "assignments" | "volunteers" | "live" | "whatsapp" | "calls";

type DriveStatus = "draft" | "open" | "in_progress" | "completed" | "cancelled";

function getStatusBadgeConfig(status: string): {
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconClass: string;
  borderClass: string;
} {
  const statusMap: Record<
    string,
    {
      label: string;
      Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
      iconClass: string;
      borderClass: string;
    }
  > = {
    draft: {
      label: "Planning",
      Icon: MoonStar,
      iconClass: "text-amber-500",
      borderClass: "border-amber-500/50",
    },
    open: {
      label: "Scheduled",
      Icon: Users,
      iconClass: "text-emerald-500",
      borderClass: "border-emerald-500/50",
    },
    in_progress: {
      label: "In progress",
      Icon: PlayCircle,
      iconClass: "text-sky-500",
      borderClass: "border-sky-500/50",
    },
    completed: {
      label: "Completed",
      Icon: CheckCircle2,
      iconClass: "text-emerald-500",
      borderClass: "border-emerald-500/50",
    },
    cancelled: {
      label: "Cancelled",
      Icon: XCircle,
      iconClass: "text-red-500",
      borderClass: "border-red-500/50",
    },
  };

  return (
    statusMap[status] ?? {
      label: status.replace("_", " "),
      Icon: Calendar,
      iconClass: "text-muted-foreground",
      borderClass: "border-muted-foreground/50",
    }
  );
}

export default function DriveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [drive, setDrive] = useState<any>(null);
  const [driveDuties, setDriveDuties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<{ assignmentCount: number; availabilityCount: number } | null>(null);
  const [view, setView] = useState<DriveView>("assignments");

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

  async function openDeleteDialog() {
    setDeleteOpen(true);
    const { count: assignmentCount } = await supabase
      .from("assignments")
      .select("*", { count: "exact", head: true })
      .eq("drive_id", id);
    const { count: availabilityCount } = await supabase
      .from("volunteer_availability")
      .select("*", { count: "exact", head: true })
      .eq("drive_id", id);
    setDeleteInfo({
      assignmentCount: assignmentCount || 0,
      availabilityCount: availabilityCount || 0,
    });
  }

  async function handleDeleteDrive() {
    setDeleting(true);
    const result = await deleteDrive(id);
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      posthog.capture("drive_deleted", {
        drive_id: id,
        drive_name: drive?.name,
        drive_status: drive?.status,
        assignment_count: deleteInfo?.assignmentCount ?? 0,
      });
      toast.success("Drive deleted");
      router.push("/drives");
    }
    setDeleteOpen(false);
    setDeleteInfo(null);
  }

  function handleStatusChange(newStatus: string) {
    if (drive) {
      setDrive({ ...drive, status: newStatus });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 page-fade-in">
        <section className="overflow-hidden rounded-2xl border px-5 py-5 md:px-8 md:py-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3 md:max-w-xl">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-4 w-96" />
              <Skeleton className="h-4 w-80" />
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!drive) {
    return (
      <div className="py-12 text-center page-fade-in">Drive not found</div>
    );
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
  const hasTarget =
    typeof drive.volunteer_target === "number" && drive.volunteer_target > 0;
  const capacityMismatch =
    hasTarget && drive.volunteer_target !== totalCapacity;
  const volunteerFillPercent =
    totalCapacity > 0
      ? Math.round((totalAssigned / totalCapacity) * 100)
      : 0;

  return (
    <div className="space-y-3 page-fade-in">
      {/* Compact header */}
      <section className="rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-lg font-semibold tracking-tight">
            {drive.name}
          </h1>
          {(() => {
            const statusConfig = getStatusBadgeConfig(drive.status);
            const StatusIcon = statusConfig.Icon;
            const { variant } = getStatusBadgeVariant(drive.status);
            return (
              <Badge
                variant={variant}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              >
                <StatusIcon className={`h-3 w-3 ${statusConfig.iconClass}`} />
                {statusConfig.label}
              </Badge>
            );
          })()}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {formatDate(drive.drive_date)}
            {drive.sunset_time && <> · Sunset {formatTime(drive.sunset_time)}</>}
            {drive.location_name && <> · {drive.location_name}</>}
            {hasTarget && <> · {totalAssigned}/{totalCapacity} volunteers</>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <DriveStatusControl
              driveId={drive.id}
              currentStatus={drive.status}
              onStatusChange={handleStatusChange}
            />
            {drive.status !== "completed" && drive.status !== "cancelled" && (
              <Link href={`/drives/${id}/edit`}>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
            <Button
              variant="destructive"
              size="icon"
              onClick={openDeleteDialog}
              className="h-7 w-7 shrink-0 rounded-full"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {/* Tabs */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 rounded-full bg-muted/80 p-1 w-fit">
          {/* Overview tab temporarily disabled */}
          <Button
            type="button"
            size="sm"
            variant={view === "assignments" ? "default" : "outline"}
            className={`h-7 rounded-full px-3 text-xs font-medium ${
              view === "assignments"
                ? ""
                : "border-border/50 bg-background/50 hover:bg-muted/80 hover:border-border/60"
            }`}
            onClick={() => setView("assignments")}
          >
            Duty Board
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "volunteers" ? "default" : "outline"}
            className={`h-7 rounded-full px-3 text-xs font-medium ${
              view === "volunteers"
                ? ""
                : "border-border/50 bg-background/50 hover:bg-muted/80 hover:border-border/60"
            }`}
            onClick={() => setView("volunteers")}
          >
            Volunteers
          </Button>
          {/* Live Dashboard tab temporarily disabled */}
          <Button
            type="button"
            size="sm"
            variant={view === "whatsapp" ? "default" : "outline"}
            className={`h-7 rounded-full px-3 text-xs font-medium ${
              view === "whatsapp"
                ? ""
                : "border-border/50 bg-background/50 hover:bg-muted/80 hover:border-border/60"
            }`}
            onClick={() => setView("whatsapp")}
          >
            WhatsApp
          </Button>
          {/* Call Center tab temporarily disabled */}
        </div>
      </section>

      {/* Capacity warning */}
      {capacityMismatch && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Target {drive.volunteer_target} volunteers but capacity is {totalCapacity}. Adjust on Duty Board.
          </span>
        </div>
      )}

      {/* View content */}
      <section className="space-y-6">
        {/* Overview temporarily disabled */}
        {false && view === "overview" && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-0 pt-4 sm:pt-6">
                  <CardTitle className="text-base">Duty capacity</CardTitle>
                  <div className="flex items-center gap-2">
                    <span
                      className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground"
                      title={`${totalAssigned} of ${totalCapacity} slots filled`}
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {totalAssigned}/{totalCapacity}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      onClick={() => setView("assignments")}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Manage
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 pt-0">
                  <div className="space-y-2.5 [list-style:none]">
                    {driveDuties.map((dd) => {
                      const capacity =
                        dd.manual_capacity_override ?? dd.calculated_capacity;
                      const pct =
                        capacity > 0
                          ? Math.round((dd.current_assigned / capacity) * 100)
                          : 0;
                      const duty = dd.duties;
                      const isFull = pct >= 100;
                      const isEmpty = pct === 0;

                      return (
                        <div
                          key={dd.id}
                          className="stagger-item flex flex-col gap-2 rounded-lg border border-border bg-muted/60 px-3 py-3 transition-all duration-200 hover:bg-muted/80"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {duty?.name}
                              </span>
                              {duty?.gender_restriction && (
                                <span
                                  className={cn(
                                    "rounded px-2 py-0.5 text-xs font-medium uppercase",
                                    duty.gender_restriction === "male"
                                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                  )}
                                >
                                  {duty.gender_restriction}
                                </span>
                              )}
                            </div>
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {dd.current_assigned}/{capacity}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500 ease-out",
                                isFull && "bg-emerald-500 dark:bg-emerald-500/90",
                                !isFull && !isEmpty && "bg-primary",
                                isEmpty && "bg-muted-foreground/30"
                              )}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {typeof drive.location_lat === "number" &&
                typeof drive.location_lng === "number" && (
                  <Card className="overflow-hidden">
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-0 pt-4 sm:pt-6">
                      <CardTitle className="text-base">Drive location</CardTitle>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(
                          `${drive.location_lat},${drive.location_lng}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open in Google Maps
                      </a>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="overflow-hidden rounded-xl border border-border/80 bg-muted/40">
                        <LocationMap
                          lat={drive.location_lat}
                          lng={drive.location_lng}
                          readOnly
                          hideAddressText
                        />
                      </div>
                      {(drive.location_name || drive.location_address) && (
                        <div className="space-y-1">
                          {drive.location_name &&
                            drive.location_address &&
                            drive.location_name !== drive.location_address && (
                              <p className="text-xs font-medium text-muted-foreground/90">
                                {drive.location_name}
                              </p>
                            )}
                          <p className="text-sm text-muted-foreground">
                            {drive.location_address ?? drive.location_name}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
            </div>
          </div>
        )}

        {view === "assignments" && (
          <div className="rounded-2xl border bg-card/60 p-4 md:p-6">
            <AssignmentsPage />
          </div>
        )}

        {view === "volunteers" && (
          <div className="rounded-2xl border bg-card/60 p-4 md:p-6">
            <VolunteersPage />
          </div>
        )}

        {/* Live Dashboard temporarily disabled */}

        {view === "whatsapp" && (
          <div className="rounded-2xl border bg-card/60 p-4 md:p-6">
            <WhatsAppPage />
          </div>
        )}

        {/* Call Center temporarily disabled */}
      </section>

      {/* Delete Drive Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteInfo(null); } }}>
        <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="shrink-0 px-6 pr-10 pt-6 pb-2">
            <DialogTitle>Delete Drive</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{drive.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteInfo && (
            <div className="space-y-2 overflow-y-auto px-6 py-2 text-sm min-h-0 flex-1">
              {deleteInfo.assignmentCount > 0 && (
                <p className="text-destructive">
                  {deleteInfo.assignmentCount} volunteer assignment{deleteInfo.assignmentCount !== 1 ? "s" : ""} will be removed.
                </p>
              )}
              {deleteInfo.availabilityCount > 0 && (
                <p className="text-destructive">
                  {deleteInfo.availabilityCount} volunteer sign-up{deleteInfo.availabilityCount !== 1 ? "s" : ""} will be removed.
                </p>
              )}
              {deleteInfo.assignmentCount === 0 && deleteInfo.availabilityCount === 0 && (
                <p className="text-muted-foreground">This drive has no volunteer assignments or sign-ups.</p>
              )}
            </div>
          )}
          <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteInfo(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteDrive} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Drive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
