import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("03")) {
    cleaned = "+92" + cleaned.slice(1);
  } else if (cleaned.startsWith("92")) {
    cleaned = "+" + cleaned;
  } else if (cleaned.startsWith("0092")) {
    cleaned = "+" + cleaned.slice(2);
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+92" + cleaned;
  }
  return cleaned;
}

export function formatPhone(phone: string): string {
  if (phone.startsWith("+92") && phone.length === 13) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
  }
  return phone;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(timeStr: string | null): string {
  if (!timeStr) return "—";
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

const STATUS_LIST = [
  "draft",
  "open",
  "in_progress",
  "completed",
  "cancelled",
  "assigned",
  "confirmed",
  "en_route",
  "arrived",
  "no_show",
  "waitlisted",
  "active",
] as const;

export function getStatusColor(status: string): string {
  if (STATUS_LIST.includes(status as (typeof STATUS_LIST)[number])) {
    return `bg-[hsl(var(--status-${status}-bg))] text-[hsl(var(--status-${status}-fg))]`;
  }
  return "bg-[hsl(var(--status-draft-bg))] text-[hsl(var(--status-draft-fg))]";
}

export function getStatusDotColor(status: string): string {
  if (STATUS_LIST.includes(status as (typeof STATUS_LIST)[number])) {
    return `bg-[hsl(var(--status-${status}-dot))]`;
  }
  return "bg-[hsl(var(--status-draft-dot))]";
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
