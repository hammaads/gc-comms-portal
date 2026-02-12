"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { AnalyticsSkeleton } from "@/components/skeletons/analytics-skeleton";
import { Users, CalendarDays, Utensils, Award, Trophy } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

// Resolved hex values for recharts SVG compatibility
const COLORS = [
  "#c28519", // gold/primary
  "#1a8a5c", // emerald/accent
  "#d97706", // amber
  "#2b7ab5", // blue
  "#c93d6e", // rose
  "#0891b2", // cyan
  "#ca8a04", // yellow
  "#6366f1", // indigo
];

const STAT_ICONS = [
  { icon: Users, color: "bg-primary/10 text-primary" },
  { icon: CalendarDays, color: "bg-amber-500/10 text-amber-600" },
  { icon: Utensils, color: "bg-accent/10 text-accent" },
  { icon: Award, color: "bg-blue-500/10 text-blue-600" },
];

const MEDAL_STYLES = [
  "bg-amber-100 text-amber-700 border-amber-300",
  "bg-gray-100 text-gray-600 border-gray-300",
  "bg-orange-100 text-orange-700 border-orange-300",
];

export default function AnalyticsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalVolunteers: 0,
    totalDrives: 0,
    totalAssignments: 0,
    completedAssignments: 0,
  });
  const [dutyDistribution, setDutyDistribution] = useState<
    Array<{ name: string; value: number }>
  >([]);
  const [driveStats, setDriveStats] = useState<
    Array<{ name: string; volunteers: number }>
  >([]);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ name: string; drives: number }>
  >([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    const [volRes, driveRes, assignRes, dutiesRes] = await Promise.all([
      supabase.from("volunteers").select("id", { count: "exact" }),
      supabase.from("drives").select("id, name", { count: "exact" }),
      supabase
        .from("assignments")
        .select("id, status, duty_id, drive_id, duties(name), drives(name)")
        .not("status", "eq", "waitlisted"),
      supabase.from("duties").select("id, name"),
    ]);

    setStats({
      totalVolunteers: volRes.count || 0,
      totalDrives: driveRes.count || 0,
      totalAssignments: assignRes.data?.length || 0,
      completedAssignments:
        assignRes.data?.filter((a) => a.status === "completed").length || 0,
    });

    const dutyCount: Record<string, number> = {};
    assignRes.data?.forEach((a) => {
      const name = (a.duties as any)?.name || "Unknown";
      dutyCount[name] = (dutyCount[name] || 0) + 1;
    });
    setDutyDistribution(
      Object.entries(dutyCount).map(([name, value]) => ({ name, value })),
    );

    const driveCount: Record<string, { name: string; count: number }> = {};
    assignRes.data?.forEach((a) => {
      const driveName = (a.drives as any)?.name || a.drive_id;
      if (!driveCount[a.drive_id]) {
        driveCount[a.drive_id] = { name: driveName, count: 0 };
      }
      driveCount[a.drive_id].count++;
    });
    setDriveStats(
      Object.values(driveCount).map((d) => ({
        name: d.name,
        volunteers: d.count,
      })),
    );

    const { data: topVolunteers } = await supabase
      .from("volunteers")
      .select("name, total_drives_attended")
      .gt("total_drives_attended", 0)
      .order("total_drives_attended", { ascending: false })
      .limit(10);

    setLeaderboard(
      topVolunteers?.map((v) => ({
        name: v.name,
        drives: v.total_drives_attended,
      })) || [],
    );

    setLoading(false);
  }

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  const statCards = [
    { label: "Total Volunteers", value: stats.totalVolunteers },
    { label: "Total Drives", value: stats.totalDrives },
    { label: "Total Assignments", value: stats.totalAssignments },
    { label: "Completed", value: stats.completedAssignments },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((stat, i) => {
          const { icon: Icon, color } = STAT_ICONS[i];
          return (
            <Card key={stat.label} className="overflow-hidden">
              <div
                className="h-1"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
                <AnimatedCounter
                  value={stat.value}
                  className="mt-2 block text-3xl font-bold"
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Duty Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {dutyDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dutyDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) =>
                      `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {dutyDistribution.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No assignment data yet
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volunteers Per Drive</CardTitle>
          </CardHeader>
          <CardContent>
            {driveStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={driveStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="volunteers" fill="#c28519" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No drive data yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {leaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Volunteer Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leaderboard.map((v, i) => (
                <div
                  key={v.name}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    {i < 3 ? (
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${MEDAL_STYLES[i]}`}
                      >
                        {i + 1}
                      </span>
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center text-sm font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                    <span className="font-medium">{v.name}</span>
                  </div>
                  <span className="font-bold">{v.drives} drives</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
