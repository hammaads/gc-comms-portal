"use client";

import { updateDrive } from "../actions";
import posthog from "posthog-js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  MoonStar,
  PlayCircle,
  XCircle,
  Users,
} from "lucide-react";

type DriveStatus = "draft" | "open" | "in_progress" | "completed" | "cancelled";

const STATUS_OPTIONS: {
  value: DriveStatus;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconClass: string;
}[] = [
  {
    value: "draft",
    label: "Planning",
    Icon: MoonStar,
    iconClass: "text-amber-500",
  },
  {
    value: "open",
    label: "Scheduled",
    Icon: Users,
    iconClass: "text-emerald-500",
  },
  {
    value: "in_progress",
    label: "In progress",
    Icon: PlayCircle,
    iconClass: "text-sky-500",
  },
  {
    value: "completed",
    label: "Completed",
    Icon: CheckCircle2,
    iconClass: "text-emerald-500",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    Icon: XCircle,
    iconClass: "text-red-500",
  },
];

function getStatusLabel(status: string): string {
  const match = STATUS_OPTIONS.find((s) => s.value === status);
  return match?.label ?? status.replace("_", " ");
}

export function DriveStatusControl({
  driveId,
  currentStatus,
  onStatusChange,
}: {
  driveId: string;
  currentStatus: string;
  onStatusChange?: (newStatus: string) => void;
}) {
  async function handleChange(newStatus: string) {
    const formData = new FormData();
    formData.set("status", newStatus);
    const result = await updateDrive(driveId, formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      posthog.capture("drive_status_changed", {
        drive_id: driveId,
        from_status: currentStatus,
        to_status: newStatus,
      });
      toast.success(`Status updated to ${getStatusLabel(newStatus)}`);
      onStatusChange?.(newStatus);
    }
  }

  const active = STATUS_OPTIONS.find((s) => s.value === currentStatus as DriveStatus);

  return (
    <Select value={currentStatus} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-[180px] rounded-full border-0 bg-secondary/60 px-3 text-xs font-medium">
        <SelectValue
          placeholder="Status"
          aria-label={active ? active.label : undefined}
        />
      </SelectTrigger>
      <SelectContent position="popper" side="bottom" align="end">
        {STATUS_OPTIONS.map(({ value, label, Icon, iconClass }) => (
          <SelectItem
            key={value}
            value={value}
            className="flex items-center gap-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${iconClass}`} />
              <span className="font-medium">{label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
