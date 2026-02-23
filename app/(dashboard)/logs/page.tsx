"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SkeletonTableRow } from "@/components/ui/skeleton-table";
import { formatPhone } from "@/lib/utils";
import {
  Search,
  CheckCircle2,
  XCircle,
  Link2,
  Minus,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 25;

type VolunteerLog = {
  id: string;
  name: string;
  phone: string;
  gender: string;
  created_at: string;
  whatsapp_group_status: string | null;
  welcomeStatus: string | null;
  welcomeMessageId: string | null;
  welcomeError: string | null;
  msgsSent: number;
  msgsReceived: number;
  lastError: string | null;
};

type Drive = { id: string; name: string; drive_date: string };

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ActivityLogPage() {
  const supabase = createClient();

  const [volunteers, setVolunteers] = useState<VolunteerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [groupFilter, setGroupFilter] = useState("all");
  const [welcomeFilter, setWelcomeFilter] = useState("all");
  const [driveFilter, setDriveFilter] = useState("all");

  // Drives for filter dropdown
  const [drives, setDrives] = useState<Drive[]>([]);

  // Retry loading state (keyed by scheduled_message id)
  const [retrying, setRetrying] = useState<string | null>(null);

  // Load drives for filter dropdown (once)
  useEffect(() => {
    supabase
      .from("drives")
      .select("id, name, drive_date")
      .in("status", ["draft", "open", "in_progress"])
      .order("drive_date", { ascending: false })
      .then(({ data }) => {
        if (data) setDrives(data);
      });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    // ── Step 1: Scope volunteer IDs by drive filter ──────────────────────
    let driveVolunteerIds: string[] | null = null;
    if (driveFilter !== "all") {
      const { data: assignments } = await supabase
        .from("assignments")
        .select("volunteer_id")
        .eq("drive_id", driveFilter);
      driveVolunteerIds = [
        ...new Set((assignments || []).map((a) => a.volunteer_id)),
      ];
      if (driveVolunteerIds.length === 0) {
        setVolunteers([]);
        setTotal(0);
        setLoading(false);
        return;
      }
    }

    // ── Step 2: Scope volunteer IDs by welcome filter ────────────────────
    let welcomeVolunteerIds: string[] | null = null;
    if (welcomeFilter !== "all") {
      const { data: msgs } = await supabase
        .from("scheduled_messages")
        .select("volunteer_id")
        .eq("status", welcomeFilter)
        .is("drive_id", null);
      welcomeVolunteerIds = [
        ...new Set(
          (msgs || []).map((m) => m.volunteer_id).filter(Boolean) as string[]
        ),
      ];
      if (welcomeVolunteerIds.length === 0) {
        setVolunteers([]);
        setTotal(0);
        setLoading(false);
        return;
      }
    }

    // ── Step 3: Query volunteers ─────────────────────────────────────────
    let query = supabase
      .from("volunteers")
      .select("id, name, phone, gender, created_at, whatsapp_group_status", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (debouncedSearch) {
      query = query.or(
        `name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`
      );
    }
    if (groupFilter !== "all") {
      if (groupFilter === "not_attempted") {
        query = query.is("whatsapp_group_status", null);
      } else {
        query = query.eq("whatsapp_group_status", groupFilter);
      }
    }
    if (driveVolunteerIds) {
      query = query.in("id", driveVolunteerIds);
    }
    if (welcomeVolunteerIds) {
      query = query.in("id", welcomeVolunteerIds);
    }

    const { data: vols, count } = await query;
    if (!vols || vols.length === 0) {
      setVolunteers([]);
      setTotal(count ?? 0);
      setLoading(false);
      return;
    }

    const volIds = vols.map((v) => v.id);

    // ── Step 4: Batch-fetch related data ─────────────────────────────────
    const [{ data: welcomeMsgs }, { data: commLogs }] = await Promise.all([
      supabase
        .from("scheduled_messages")
        .select("id, volunteer_id, status, error")
        .in("volunteer_id", volIds)
        .is("drive_id", null),
      supabase
        .from("communication_log")
        .select("volunteer_id, direction")
        .in("volunteer_id", volIds)
        .eq("channel", "whatsapp"),
    ]);

    // Index welcome messages — keep highest-priority status per volunteer
    const STATUS_PRIORITY: Record<string, number> = {
      sent: 3,
      pending: 2,
      failed: 1,
    };
    const welcomeMap = new Map<
      string,
      { id: string; status: string; error: string | null }
    >();
    for (const m of welcomeMsgs || []) {
      if (!m.volunteer_id) continue;
      const existing = welcomeMap.get(m.volunteer_id);
      if (
        !existing ||
        (STATUS_PRIORITY[m.status] ?? 0) >
          (STATUS_PRIORITY[existing.status] ?? 0)
      ) {
        welcomeMap.set(m.volunteer_id, {
          id: m.id,
          status: m.status,
          error: m.error,
        });
      }
    }

    // Count sent/received per volunteer
    const commMap = new Map<string, { sent: number; received: number }>();
    for (const c of commLogs || []) {
      const entry = commMap.get(c.volunteer_id) || { sent: 0, received: 0 };
      if (c.direction === "outbound") entry.sent++;
      else entry.received++;
      commMap.set(c.volunteer_id, entry);
    }

    // ── Step 5: Merge ────────────────────────────────────────────────────
    const merged: VolunteerLog[] = vols.map((v) => {
      const w = welcomeMap.get(v.id);
      const c = commMap.get(v.id);
      return {
        ...v,
        welcomeStatus: w?.status ?? null,
        welcomeMessageId: w?.id ?? null,
        welcomeError: w?.error ?? null,
        msgsSent: c?.sent ?? 0,
        msgsReceived: c?.received ?? 0,
        lastError: w?.error ?? null,
      };
    });

    setVolunteers(merged);
    setTotal(count ?? 0);
    setLoading(false);
  }, [debouncedSearch, groupFilter, welcomeFilter, driveFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset page when filters change
  const resetPage = () => setPage(0);

  // ── Retry welcome DM ──────────────────────────────────────────────────────

  async function retryWelcome(messageId: string) {
    setRetrying(messageId);
    const { error } = await supabase
      .from("scheduled_messages")
      .update({ status: "pending", error: null, retry_count: 0 })
      .eq("id", messageId);
    if (error) {
      toast.error("Failed to retry: " + error.message);
    } else {
      toast.success("Message re-queued — will be sent within a minute");
      loadData();
    }
    setRetrying(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasFilters =
    debouncedSearch ||
    groupFilter !== "all" ||
    welcomeFilter !== "all" ||
    driveFilter !== "all";

  return (
    <div className="space-y-6 page-fade-in">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground">
          WhatsApp delivery status for each volunteer — group adds, welcome
          messages, and errors
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
          />
        </div>
        <Select
          value={driveFilter}
          onValueChange={(v) => {
            setDriveFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Drive" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drives</SelectItem>
            {drives.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={groupFilter}
          onValueChange={(v) => {
            setGroupFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="Group Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Group Status</SelectItem>
            <SelectItem value="added">Added</SelectItem>
            <SelectItem value="invite_sent">Invite Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="not_attempted">Not Attempted</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={welcomeFilter}
          onValueChange={(v) => {
            setWelcomeFilter(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="Welcome DM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Welcome DM</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Volunteer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Welcome DM</TableHead>
              <TableHead className="text-center">Sent</TableHead>
              <TableHead className="text-center">Received</TableHead>
              <TableHead>Errors</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={9} />
              ))
            ) : volunteers.length === 0 ? (
              <TableRow className="empty-state">
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="empty-state-icon text-4xl">
                      {hasFilters ? "🔍" : "📋"}
                    </div>
                    <p className="text-base font-medium">
                      {hasFilters
                        ? "No matching volunteers"
                        : "No activity yet"}
                    </p>
                    <p className="text-sm">
                      {hasFilters
                        ? "Try adjusting your search or filters"
                        : "Volunteers will appear here after they sign up"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              volunteers.map((v) => (
                <TableRow key={v.id} className="stagger-item">
                  <TableCell>
                    <Link
                      href={`/volunteers/${v.id}`}
                      className="font-medium hover:underline"
                    >
                      {v.name}
                    </Link>
                    <p className="text-xs text-muted-foreground capitalize">
                      {v.gender}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatPhone(v.phone)}
                  </TableCell>
                  <TableCell>
                    <GroupStatusBadge status={v.whatsapp_group_status} />
                  </TableCell>
                  <TableCell>
                    <WelcomeBadge status={v.welcomeStatus} />
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {v.msgsSent}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {v.msgsReceived}
                  </TableCell>
                  <TableCell>
                    <ErrorCell error={v.lastError} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(v.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {v.welcomeStatus === "failed" && v.welcomeMessageId && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={retrying === v.welcomeMessageId}
                              onClick={() =>
                                retryWelcome(v.welcomeMessageId!)
                              }
                            >
                              {retrying === v.welcomeMessageId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Retry welcome DM</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Badge Components ─────────────────────────────────────────────────────────

function GroupStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "added":
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Added
        </Badge>
      );
    case "invite_sent":
      return (
        <Badge variant="warning" className="gap-1">
          <Link2 className="h-3 w-3" />
          Invite Sent
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Minus className="h-3 w-3" />
          N/A
        </Badge>
      );
  }
}

function WelcomeBadge({ status }: { status: string | null }) {
  switch (status) {
    case "sent":
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Sent
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="warning" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Minus className="h-3 w-3" />
          N/A
        </Badge>
      );
  }
}

function ErrorCell({ error }: { error: string | null }) {
  if (!error) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-sm text-destructive cursor-help">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="max-w-[120px] truncate">{error}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="text-sm">{error}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
