"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2,
  Wand2,
  RefreshCw,
  GripVertical,
  Settings,
  UserX,
  AlertTriangle,
  Search,
  UserPlus,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn, normalizePhone } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonKanbanColumn } from "@/components/ui/skeleton-kanban";
import { CountryCodePicker } from "@/components/ui/country-code-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Assignment = {
  id: string;
  volunteer_id: string;
  drive_id: string;
  duty_id: string;
  status: string;
  is_manual_override: boolean;
  volunteers: { name: string; phone: string; gender: string } | null;
};

type DriveDuty = {
  id: string;
  duty_id: string;
  calculated_capacity: number;
  manual_capacity_override: number | null;
  current_assigned: number;
  duties: { name: string; slug: string; gender_restriction: string | null; display_order?: number } | null;
};

type VolunteerSearchResult = {
  id: string;
  name: string;
  phone: string;
  gender: "male" | "female" | null;
  email: string | null;
  organization: string | null;
};

type NewVolunteerFormState = {
  name: string;
  phone: string;
  gender: "male" | "female";
  email: string;
  organization: string;
};

const DUTY_COLUMN_MIN_WIDTH_PX = 260;
const NEW_VOLUNTEER_DEFAULT: NewVolunteerFormState = {
  name: "",
  phone: "",
  gender: "male",
  email: "",
  organization: "",
};

function truncateVolunteerName(
  name: string | null | undefined
): string {
  const n = name ?? "—";
  // Let CSS truncation decide based on available column width.
  return n;
}

function DroppableColumn({
  id,
  children,
  className,
}: {
  id: string;
  children: (isOver: boolean) => React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className}>
      {children(isOver)}
    </div>
  );
}

function VolunteerCard({
  assignment,
  isDragging,
  onCancel,
}: {
  assignment: Assignment;
  isDragging?: boolean;
  onCancel?: (assignmentId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: assignment.id });
  const v = assignment.volunteers;
  const genderLetter =
    v?.gender?.charAt(0)?.toUpperCase() === "F"
      ? "F"
      : v?.gender?.charAt(0)?.toUpperCase() === "M"
        ? "M"
        : null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isCancelled = assignment.status === "cancelled";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-border/80 bg-card px-2 py-1.5 text-xs",
        isCancelled && "opacity-40",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1 flex items-center gap-2 flex-nowrap">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs font-medium text-foreground",
            isCancelled && "line-through",
          )}
          title={v?.name ?? undefined}
        >
          {truncateVolunteerName(v?.name)}
        </span>
        {genderLetter && (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-[10px] px-1 py-0 font-medium",
              genderLetter === "M"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
            )}
          >
            {genderLetter}
          </Badge>
        )}
        {onCancel && !isCancelled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(assignment.id);
            }}
            className="shrink-0 flex items-center justify-center rounded p-1 text-red-400 hover:bg-red-500/10 hover:text-red-600"
            aria-label={`Cancel ${v?.name ?? "volunteer"}`}
          >
            <UserX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AssignmentsPage() {
  const { id: driveId } = useParams<{ id: string }>();
  const supabase = createClient();
  const [driveDuties, setDriveDuties] = useState<DriveDuty[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overDropTarget, setOverDropTarget] = useState<{
    dutyId: string;
    index: number;
  } | null>(null);
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [capacityInputs, setCapacityInputs] = useState<Record<string, string>>({});
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addVolunteerModalOpen, setAddVolunteerModalOpen] = useState(false);
  const [addVolunteerMode, setAddVolunteerMode] = useState<"existing" | "new">("existing");
  const [existingVolunteerQuery, setExistingVolunteerQuery] = useState("");
  const [existingVolunteerResults, setExistingVolunteerResults] = useState<
    VolunteerSearchResult[]
  >([]);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");
  const [searchingVolunteers, setSearchingVolunteers] = useState(false);
  const [savingVolunteer, setSavingVolunteer] = useState(false);
  const [newVolunteerCountryCode, setNewVolunteerCountryCode] = useState("+92");
  const [newVolunteerForm, setNewVolunteerForm] = useState<NewVolunteerFormState>(
    NEW_VOLUNTEER_DEFAULT,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    loadData();

    // Realtime subscription
    const channel = supabase
      .channel("assignments-realtime")
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
    const [dutiesRes, assignRes] = await Promise.all([
      supabase
        .from("drive_duties")
        .select("*, duties(name, slug, gender_restriction, display_order)")
        .eq("drive_id", driveId)
        .order("created_at"),
      supabase
        .from("assignments")
        .select("*, volunteers(name, phone, gender)")
        .eq("drive_id", driveId)
        .order("created_at"),
    ]);

    if (dutiesRes.data) {
      const rows = dutiesRes.data as unknown as DriveDuty[];
      const sorted = [...rows].sort((a, b) => {
        const orderA = a.duties?.display_order ?? 999;
        const orderB = b.duties?.display_order ?? 999;
        return orderA - orderB;
      });
      setDriveDuties(sorted);
    }
    if (assignRes.data) setAssignments(assignRes.data as unknown as Assignment[]);
    setLoading(false);
  }

  /** Refresh only the kanban data (drive_duties + assignments). Does not touch parent or other views. */
  async function refreshKanban() {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }

  function resetAddVolunteerModal() {
    setAddVolunteerMode("existing");
    setExistingVolunteerQuery("");
    setExistingVolunteerResults([]);
    setSelectedVolunteerId("");
    setSearchingVolunteers(false);
    setSavingVolunteer(false);
    setNewVolunteerCountryCode("+92");
    setNewVolunteerForm(NEW_VOLUNTEER_DEFAULT);
  }

  async function searchExistingVolunteers(query: string) {
    setSearchingVolunteers(true);

    const trimmedQuery = query.trim();
    const baseSelect = () =>
      supabase
        .from("volunteers")
        .select("id, name, phone, gender, email, organization")
        .order("updated_at", { ascending: false });

    let rows: VolunteerSearchResult[] = [];
    let errorMessage: string | null = null;

    if (trimmedQuery.length === 0) {
      const { data, error } = await baseSelect().limit(20);
      if (error) {
        errorMessage = error.message;
      } else {
        rows = (data ?? []) as VolunteerSearchResult[];
      }
    } else {
      const safePattern = `%${trimmedQuery.replace(/[%_]/g, "")}%`;
      const [nameRes, phoneRes] = await Promise.all([
        baseSelect().ilike("name", safePattern).limit(20),
        baseSelect().ilike("phone", safePattern).limit(20),
      ]);

      if (nameRes.error || phoneRes.error) {
        errorMessage = nameRes.error?.message ?? phoneRes.error?.message ?? null;
      } else {
        const merged = [
          ...((nameRes.data ?? []) as VolunteerSearchResult[]),
          ...((phoneRes.data ?? []) as VolunteerSearchResult[]),
        ];
        const deduped = merged.filter(
          (volunteer, index, array) =>
            array.findIndex((item) => item.id === volunteer.id) === index,
        );
        rows = deduped.slice(0, 20);
      }
    }
    setSearchingVolunteers(false);

    if (errorMessage) {
      toast.error(`Failed to load volunteers: ${errorMessage}`);
      return;
    }

    setExistingVolunteerResults(rows);
    if (rows.length > 0 && !rows.some((v) => v.id === selectedVolunteerId)) {
      setSelectedVolunteerId(rows[0].id);
    }
  }

  function openAddVolunteerModal() {
    resetAddVolunteerModal();
    setAddVolunteerModalOpen(true);
    void searchExistingVolunteers("");
  }

  async function handleSearchExistingVolunteers(
    e?: React.FormEvent<HTMLFormElement>,
  ) {
    e?.preventDefault();
    await searchExistingVolunteers(existingVolunteerQuery);
  }

  async function handleAddVolunteerToDrive() {
    setSavingVolunteer(true);
    try {
      let payload:
        | {
            driveId: string;
            mode: "existing";
            volunteerId: string;
          }
        | {
            driveId: string;
            mode: "new";
            name: string;
            phone: string;
            gender: "male" | "female";
            email: string | null;
            organization: string | null;
          };

      if (addVolunteerMode === "existing") {
        if (!selectedVolunteerId) {
          toast.error("Select a volunteer first");
          return;
        }

        payload = {
          driveId,
          mode: "existing",
          volunteerId: selectedVolunteerId,
        };
      } else {
        const name = newVolunteerForm.name.trim();
        const phone = newVolunteerForm.phone.trim();

        if (!name || !phone) {
          toast.error("Name and phone are required");
          return;
        }

        payload = {
          driveId,
          mode: "new",
          name,
          phone: normalizePhone(phone, newVolunteerCountryCode),
          gender: newVolunteerForm.gender,
          email: newVolunteerForm.email.trim() || null,
          organization: newVolunteerForm.organization.trim() || null,
        };
      }

      const res = await fetch("/api/assignments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.code === "ALREADY_REGISTERED") {
          toast.info(data?.error ?? "Volunteer is already registered");
          return;
        }
        toast.error(data?.error ?? "Failed to add volunteer");
        return;
      }

      posthog.capture("volunteer_manually_added_to_drive", {
        drive_id: driveId,
        mode: addVolunteerMode,
        assignment_status: data?.assignment?.status ?? null,
      });
      toast.success(data?.message ?? "Volunteer added to drive");
      setAddVolunteerModalOpen(false);
      resetAddVolunteerModal();
      await loadData();
    } catch {
      toast.error("Failed to add volunteer");
    } finally {
      setSavingVolunteer(false);
    }
  }

  async function handleAutoAssign() {
    setAssigning(true);
    try {
      const res = await fetch("/api/assignments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveId }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error ?? "Auto-assign failed");
        return;
      }
      if (data.error) {
        toast.error(data.error);
        return;
      }
      const count = data.count ?? 0;
      posthog.capture("auto_assign_triggered", {
        drive_id: driveId,
        volunteers_assigned: count,
      });
      if (count > 0) {
        toast.success(`Assigned ${count} volunteer${count !== 1 ? "s" : ""}`);
      } else {
        toast.info(
          "No one to assign. Volunteers in Unassigned need open duty slots; add capacity or drag them manually."
        );
      }
      loadData();
    } catch {
      toast.error("Auto-assign failed. Try again.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleCancelAssignment(assignmentId: string) {
    const assignment = assignments.find((a) => a.id === assignmentId);
    const name = assignment?.volunteers?.name ?? "this volunteer";
    toast(`Cancel ${name}'s assignment?`, {
      action: {
        label: "Cancel",
        onClick: async () => {
          const { error } = await supabase
            .from("assignments")
            .update({ status: "cancelled" })
            .eq("id", assignmentId);
          if (error) {
            toast.error("Failed to cancel assignment");
            return;
          }
          toast.success(`${name}'s assignment cancelled`);
          // Auto-promote next waitlisted volunteer
          try {
            await fetch("/api/assignments/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ driveId }),
            });
          } catch {
            // Non-critical
          }
          loadData();
        },
      },
    });
  }

  function openCapacityModal() {
    const inputs: Record<string, string> = {};
    driveDuties.forEach((dd) => {
      const capacity =
        dd.manual_capacity_override ?? dd.calculated_capacity ?? 0;
      inputs[dd.id] = String(capacity);
    });
    setCapacityInputs(inputs);
    setCapacityModalOpen(true);
  }

  async function handleSaveAllCapacities() {
    setSavingCapacity(true);
    const updates = driveDuties.map((dd) => {
      const inputValue = capacityInputs[dd.id]?.trim();
      const newValue =
        inputValue === "" || inputValue === String(dd.calculated_capacity)
          ? null
          : Math.max(0, Number(inputValue) || 0);
      return {
        id: dd.id,
        manual_capacity_override: newValue,
      };
    });

    // Batch update all capacities
    const promises = updates.map((update) =>
      supabase
        .from("drive_duties")
        .update({ manual_capacity_override: update.manual_capacity_override })
        .eq("id", update.id),
    );

    const results = await Promise.all(promises);
    const errors = results.filter((r) => r.error);

    setSavingCapacity(false);

    if (errors.length > 0) {
      toast.error(
        `Failed to update ${errors.length} capacity override(s). Please try again.`,
      );
      return;
    }

    const overrideCount = updates.filter(
      (u) => u.manual_capacity_override !== null,
    ).length;
    toast.success(
      overrideCount > 0
        ? `Updated ${overrideCount} duty capacity override(s).`
        : "All capacity overrides cleared (using system defaults).",
    );
    setCapacityModalOpen(false);
    setCapacityInputs({});
    loadData();
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) {
      setOverDropTarget(null);
      return;
    }
    const validDutyIds = new Set(driveDuties.map((dd) => dd.duty_id));
    const overId = String(over.id);
    const waitlistedList = assignments.filter((a) => a.status === "waitlisted");
    let dutyId: string;
    let index: number;
    if (overId === "unassigned") {
      dutyId = "unassigned";
      index = waitlistedList.length;
    } else if (validDutyIds.has(overId)) {
      dutyId = overId;
      index = assignments.filter(
        (a) => a.duty_id === overId && a.status !== "waitlisted"
      ).length;
    } else {
      const overAssignment = assignments.find((a) => a.id === overId);
      if (!overAssignment) {
        setOverDropTarget(null);
        return;
      }
      if (overAssignment.status === "waitlisted") {
        dutyId = "unassigned";
        index = waitlistedList.findIndex((a) => a.id === overId);
        if (index < 0) index = waitlistedList.length;
      } else {
        dutyId = overAssignment.duty_id;
        const inColumn = assignments.filter(
          (a) => a.duty_id === dutyId && a.status !== "waitlisted"
        );
        index = inColumn.findIndex((a) => a.id === overId);
        if (index < 0) index = inColumn.length;
      }
    }
    setOverDropTarget({ dutyId, index });
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverDropTarget(null);
    const { active, over } = event;
    if (!over) return;

    const assignmentId = active.id as string;
    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;

    // Resolve over.id: may be column id (duty_id or "unassigned") or an assignment id (when dropped on a card)
    const overId = String(over.id);
    const validDutyIds = new Set(driveDuties.map((dd) => dd.duty_id));

    let targetDutyId: string;
    if (overId === "unassigned") {
      targetDutyId = "unassigned";
    } else if (validDutyIds.has(overId)) {
      targetDutyId = overId;
    } else {
      // Dropped on a sortable card — use that assignment's duty_id only if valid for this drive
      const droppedOnAssignment = assignments.find((a) => a.id === overId);
      const resolved =
        droppedOnAssignment && validDutyIds.has(droppedOnAssignment.duty_id)
          ? droppedOnAssignment.duty_id
          : null;
      if (!resolved) {
        toast.error("Invalid drop target");
        return;
      }
      targetDutyId = resolved;
    }

    if (assignment.duty_id === targetDutyId && targetDutyId !== "unassigned") return;

    if (targetDutyId === "unassigned") {
      const placeholderDutyId = driveDuties[0]?.duty_id;
      if (!placeholderDutyId) return;
      const { error } = await supabase
        .from("assignments")
        .update({
          duty_id: placeholderDutyId,
          is_manual_override: true,
          status: "waitlisted",
        })
        .eq("id", assignmentId);
      if (error) {
        toast.error("Failed to unassign: " + error.message);
      } else {
        posthog.capture("volunteer_reassigned_via_drag", {
          drive_id: driveId,
          from_duty_id: assignment.duty_id,
          to_duty_id: "unassigned",
        });
        toast.success("Volunteer moved to unassigned");
        loadData();
      }
      return;
    }

    // Update assignment to new duty (targetDutyId is guaranteed to be in validDutyIds)
    const { error } = await supabase
      .from("assignments")
      .update({
        duty_id: targetDutyId,
        is_manual_override: true,
        status: assignment.status === "waitlisted" ? "assigned" : assignment.status,
      })
      .eq("id", assignmentId);

    if (error) {
      toast.error("Failed to reassign: " + error.message);
    } else {
      posthog.capture("volunteer_reassigned_via_drag", {
        drive_id: driveId,
        from_duty_id: assignment.duty_id,
        to_duty_id: targetDutyId,
      });
      toast.success("Volunteer reassigned");
      loadData();
    }
  }

  const waitlisted = assignments.filter((a) => a.status === "waitlisted");
  const dropPlaceholder = (
    <div
      className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/40 px-2 py-1.5 text-sm min-h-[34px]"
      aria-hidden
    >
      <div className="h-3.5 w-3.5 shrink-0 rounded bg-muted-foreground/20" />
      <span className="text-muted-foreground/60 text-xs">Drop here</span>
    </div>
  );
  function columnWithPlaceholder(
    dutyId: string,
    cards: React.ReactNode[]
  ): React.ReactNode[] {
    if (!activeId || !overDropTarget || overDropTarget.dutyId !== dutyId)
      return cards;
    const active = assignments.find((a) => a.id === activeId);
    const sourceDutyId =
      active?.status === "waitlisted" ? "unassigned" : active?.duty_id;
    if (sourceDutyId === dutyId) return cards; // same column: sortable shows position
    const { index } = overDropTarget;
    return [
      ...cards.slice(0, index),
      <div key="drop-placeholder">{dropPlaceholder}</div>,
      ...cards.slice(index),
    ];
  }
  const activeAssignment = activeId
    ? assignments.find((a) => a.id === activeId)
    : null;
  const selectedExistingVolunteer =
    existingVolunteerResults.find((v) => v.id === selectedVolunteerId) ?? null;

  if (loading) {
    return (
      <div className="space-y-4 page-fade-in">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div
          className="grid gap-3 pb-2"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(${DUTY_COLUMN_MIN_WIDTH_PX}px, 1fr))`,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-w-0">
              <SkeletonKanbanColumn />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 page-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Duty Board</h1>
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={openAddVolunteerModal} variant="outline" size="sm">
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Add Volunteer
          </Button>
          <Button onClick={openCapacityModal} variant="outline" size="sm">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Capacities
          </Button>
          <Button onClick={handleAutoAssign} disabled={assigning} size="sm">
            {assigning ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Auto-Assign
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshKanban}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          className="grid gap-3 pb-2"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(${DUTY_COLUMN_MIN_WIDTH_PX}px, 1fr))`,
          }}
        >
          {/* Unassigned column */}
          <DroppableColumn id="unassigned" className="min-w-0">
            {(isOver) => (
          <Card
            className={cn(
              "stagger-item border-2 border-amber-500/30 bg-card/95 h-full transition-[box-shadow,border-color]",
              isOver && "ring-2 ring-amber-500/50 ring-offset-2 ring-offset-background"
            )}
          >
            <CardHeader className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 shrink-0 text-amber-500" />
                  <CardTitle className="text-sm text-amber-600 dark:text-amber-400">
                    Unassigned
                  </CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">
                  {waitlisted.length}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Signed up, not yet assigned to a duty
              </p>
            </CardHeader>
            <CardContent>
              <div className="max-h-[300px] overflow-y-auto">
                <SortableContext
                  items={waitlisted.map((a) => a.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {columnWithPlaceholder(
                      "unassigned",
                      waitlisted.map((a) => (
                        <VolunteerCard
                          key={a.id}
                          assignment={a}
                          isDragging={activeId === a.id}
                          onCancel={handleCancelAssignment}
                        />
                      ))
                    )}
                    {waitlisted.length === 0 &&
                    !(activeId && overDropTarget?.dutyId === "unassigned") && (
                      <p className="text-center text-xs text-muted-foreground py-2">
                        No unassigned
                      </p>
                    )}
                  </div>
                </SortableContext>
              </div>
            </CardContent>
          </Card>
            )}
          </DroppableColumn>
          {driveDuties.map((dd) => {
            const dutyAssignments = assignments.filter(
              (a) =>
                a.duty_id === dd.duty_id &&
                a.status !== "waitlisted" &&
                a.status !== "cancelled" &&
                a.status !== "no_show",
            );
            const capacity =
              dd.manual_capacity_override ?? dd.calculated_capacity;
            const fillPct =
              capacity > 0
                ? Math.round((dutyAssignments.length / capacity) * 100)
                : 0;
            const isOverflow =
              typeof capacity === "number" &&
              capacity > 0 &&
              dutyAssignments.length > capacity;

            return (
              <DroppableColumn key={dd.duty_id} id={dd.duty_id} className="min-w-0">
                {(isOver) => (
              <Card
                className={cn(
                  "stagger-item h-full transition-[box-shadow,border-color]",
                  isOver && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
                )}
              >
                <CardHeader className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {dd.duties?.name}
                      {dd.duties?.gender_restriction && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[10px]"
                        >
                          {dd.duties.gender_restriction}
                        </Badge>
                      )}
                    </CardTitle>
                    <span
                      className={cn(
                        "text-xs flex items-center gap-1",
                        isOverflow
                          ? "text-amber-600 dark:text-amber-400 font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {isOverflow && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help">
                                <AlertTriangle
                                  className="h-3.5 w-3.5 shrink-0"
                                  aria-hidden
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Over capacity — more volunteers assigned than
                              capacity. Edit capacities or move volunteers.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {dutyAssignments.length}/{capacity}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverflow
                          ? "bg-amber-500"
                          : fillPct >= 100
                            ? "bg-green-500"
                            : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(fillPct, 100)}%` }}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[300px] overflow-y-auto">
                    <SortableContext
                      items={dutyAssignments.map((a) => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {columnWithPlaceholder(
                          dd.duty_id,
                          dutyAssignments.map((a) => (
                            <VolunteerCard
                              key={a.id}
                              assignment={a}
                              isDragging={activeId === a.id}
                              onCancel={handleCancelAssignment}
                            />
                          ))
                        )}
                        {dutyAssignments.length === 0 &&
                          !(activeId && overDropTarget?.dutyId === dd.duty_id) && (
                          <p className="text-center text-xs text-muted-foreground py-2">
                            No volunteers
                          </p>
                        )}
                      </div>
                    </SortableContext>
                  </div>
                </CardContent>
              </Card>
                )}
              </DroppableColumn>
            );
          })}
        </div>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay>
              {activeAssignment && (() => {
                const v = activeAssignment.volunteers;
                const genderLetter =
                  v?.gender?.charAt(0)?.toUpperCase() === "F"
                    ? "F"
                    : v?.gender?.charAt(0)?.toUpperCase() === "M"
                      ? "M"
                      : null;
                return (
                  <div className="flex items-center gap-2 rounded-md border border-border/80 bg-card px-2 py-1.5 text-sm shadow-lg cursor-grabbing">
                    <div className="shrink-0 rounded p-0.5 text-muted-foreground">
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center gap-2 flex-nowrap overflow-hidden">
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {truncateVolunteerName(v?.name)}
                      </span>
                      {genderLetter && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px] px-1 py-0 font-medium",
                            genderLetter === "M"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          )}
                        >
                          {genderLetter}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })()}
            </DragOverlay>,
            document.body
          )}
      </DndContext>

      <Dialog
        open={addVolunteerModalOpen}
        onOpenChange={(open) => {
          setAddVolunteerModalOpen(open);
          if (!open) {
            resetAddVolunteerModal();
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add Volunteer to This Drive</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border p-1">
              <Button
                type="button"
                size="sm"
                variant={addVolunteerMode === "existing" ? "default" : "ghost"}
                onClick={() => setAddVolunteerMode("existing")}
              >
                Choose Existing
              </Button>
              <Button
                type="button"
                size="sm"
                variant={addVolunteerMode === "new" ? "default" : "ghost"}
                onClick={() => setAddVolunteerMode("new")}
              >
                Create New
              </Button>
            </div>

            {addVolunteerMode === "existing" ? (
              <div className="space-y-3">
                <form
                  onSubmit={handleSearchExistingVolunteers}
                  className="flex gap-2"
                >
                  <Input
                    value={existingVolunteerQuery}
                    onChange={(e) => setExistingVolunteerQuery(e.target.value)}
                    placeholder="Search by name or phone"
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={searchingVolunteers}
                  >
                    {searchingVolunteers ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </form>

                <div className="max-h-72 overflow-y-auto rounded-md border">
                  {searchingVolunteers ? (
                    <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading volunteers
                    </div>
                  ) : existingVolunteerResults.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      No volunteers found
                    </p>
                  ) : (
                    <div className="divide-y">
                      {existingVolunteerResults.map((volunteer) => (
                        <button
                          type="button"
                          key={volunteer.id}
                          className={cn(
                            "w-full p-3 text-left transition-colors hover:bg-muted/40",
                            selectedVolunteerId === volunteer.id && "bg-primary/10",
                          )}
                          onClick={() => setSelectedVolunteerId(volunteer.id)}
                        >
                          <p className="text-sm font-medium text-foreground">
                            {volunteer.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {volunteer.phone}
                            {volunteer.organization
                              ? ` • ${volunteer.organization}`
                              : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedExistingVolunteer && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {selectedExistingVolunteer.name} (
                    {selectedExistingVolunteer.phone})
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="manual_name">
                    Full Name
                  </label>
                  <Input
                    id="manual_name"
                    value={newVolunteerForm.name}
                    onChange={(e) =>
                      setNewVolunteerForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Volunteer name"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="manual_phone">
                    Phone
                  </label>
                  <div className="flex gap-2">
                    <CountryCodePicker
                      value={newVolunteerCountryCode}
                      onChange={setNewVolunteerCountryCode}
                      className="w-[132px]"
                    />
                    <Input
                      id="manual_phone"
                      value={newVolunteerForm.phone}
                      onChange={(e) =>
                        setNewVolunteerForm((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      placeholder="3XX XXXXXXX"
                      className="min-w-[220px] flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Gender</label>
                  <Select
                    value={newVolunteerForm.gender}
                    onValueChange={(value) =>
                      setNewVolunteerForm((prev) => ({
                        ...prev,
                        gender: value as "male" | "female",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="manual_email">
                    Email (optional)
                  </label>
                  <Input
                    id="manual_email"
                    type="email"
                    value={newVolunteerForm.email}
                    onChange={(e) =>
                      setNewVolunteerForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="name@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="manual_org">
                    School / Company (optional)
                  </label>
                  <Input
                    id="manual_org"
                    value={newVolunteerForm.organization}
                    onChange={(e) =>
                      setNewVolunteerForm((prev) => ({
                        ...prev,
                        organization: e.target.value,
                      }))
                    }
                    placeholder="School or company"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddVolunteerModalOpen(false);
                resetAddVolunteerModal();
              }}
              disabled={savingVolunteer}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddVolunteerToDrive}
              disabled={
                savingVolunteer ||
                (addVolunteerMode === "existing" && !selectedVolunteerId)
              }
            >
              {savingVolunteer && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add to Drive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={capacityModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCapacityModalOpen(false);
            setCapacityInputs({});
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="shrink-0 px-6 pr-10 pt-6 pb-2">
            <DialogTitle>Edit Duty Capacities</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-6 py-4 min-h-0 flex-1">
            <p className="text-sm text-muted-foreground">
              Adjust the maximum number of volunteers for each duty on this
              drive. Leave a field empty or set it to the system default to use
              the calculated capacity.
            </p>
            <div className="space-y-3">
              {driveDuties.map((dd) => {
                const currentCapacity =
                  dd.manual_capacity_override ?? dd.calculated_capacity;
                const inputValue = capacityInputs[dd.id] ?? String(currentCapacity);
                const isOverridden = dd.manual_capacity_override !== null;

                return (
                  <div key={dd.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`capacity_${dd.id}`}
                        className="text-sm font-medium"
                      >
                        {dd.duties?.name}
                        {dd.duties?.gender_restriction && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-xs"
                          >
                            {dd.duties.gender_restriction}
                          </Badge>
                        )}
                      </label>
                      <span className="text-xs text-muted-foreground">
                        System default: {dd.calculated_capacity}
                        {isOverridden && (
                          <span className="ml-2 text-amber-400">
                            (overridden)
                          </span>
                        )}
                      </span>
                    </div>
                    <Input
                      id={`capacity_${dd.id}`}
                      type="number"
                      min={0}
                      value={inputValue}
                      onChange={(e) =>
                        setCapacityInputs({
                          ...capacityInputs,
                          [dd.id]: e.target.value,
                        })
                      }
                      placeholder={String(dd.calculated_capacity)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Currently assigned: {dd.current_assigned} volunteer
                      {dd.current_assigned !== 1 ? "s" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter className="shrink-0 flex justify-between gap-2 px-6 pb-6 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const cleared: Record<string, string> = {};
                driveDuties.forEach((dd) => {
                  cleared[dd.id] = String(dd.calculated_capacity);
                });
                setCapacityInputs(cleared);
              }}
              disabled={savingCapacity}
            >
              Reset all to defaults
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCapacityModalOpen(false);
                  setCapacityInputs({});
                }}
                disabled={savingCapacity}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveAllCapacities}
                disabled={savingCapacity}
              >
                {savingCapacity && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save All
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
