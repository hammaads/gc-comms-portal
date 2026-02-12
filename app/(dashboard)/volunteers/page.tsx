"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { VolunteersSkeleton } from "@/components/skeletons/volunteers-skeleton";
import { Badge } from "@/components/ui/badge";
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
import { formatPhone } from "@/lib/utils";
import { Search, Plus, Upload, Users } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function VolunteersPage() {
  const supabase = createClient();
  const [volunteers, setVolunteers] = useState<Tables<"volunteers">[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const loadVolunteers = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("volunteers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }
    if (genderFilter !== "all") {
      query = query.eq("gender", genderFilter as "male" | "female");
    }

    const { data, count } = await query;
    if (data) setVolunteers(data);
    if (count !== null) setTotal(count);
    setLoading(false);
  }, [search, genderFilter, page]);

  useEffect(() => {
    loadVolunteers();
  }, [loadVolunteers]);

  if (loading && volunteers.length === 0) {
    return <VolunteersSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Volunteers</h1>
          <p className="text-muted-foreground">{total} total volunteers</p>
        </div>
        <div className="flex gap-2">
          <Link href="/volunteers/import">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </Link>
          <Link href="/volunteers/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Volunteer
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={genderFilter}
          onValueChange={(v) => {
            setGenderFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Drives</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {volunteers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={Users}
                    title="No Volunteers Found"
                    description={search ? "Try a different search term." : "Add your first volunteer to get started."}
                    actionLabel={!search ? "Add Volunteer" : undefined}
                    actionHref={!search ? "/volunteers/new" : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : (
              volunteers.map((v) => (
                <TableRow key={v.id} className="group">
                  <TableCell>
                    <Link
                      href={`/volunteers/${v.id}`}
                      className="flex items-center gap-2"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {getInitials(v.name)}
                      </div>
                      <span className="font-medium group-hover:underline">
                        {v.name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatPhone(v.phone)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{v.gender}</Badge>
                  </TableCell>
                  <TableCell>{v.organization || "—"}</TableCell>
                  <TableCell>{v.total_drives_attended}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {v.source.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={v.is_active ? "active" : "draft"} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}-
            {Math.min((page + 1) * pageSize, total)} of {total}
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
              disabled={(page + 1) * pageSize >= total}
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
