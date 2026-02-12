"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, GripVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssignmentSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<{
    history_lookback: string;
    male_priority_order: string[];
    female_priority_order: string[];
    waitlist_auto_fill: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "assignment_rules")
        .single();
      if (data?.value) setConfig(data.value as any);
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("app_config")
      .update({ value: config as any })
      .eq("key", "assignment_rules");
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  function moveItem(
    list: string[],
    from: number,
    to: number,
    field: "male_priority_order" | "female_priority_order",
  ) {
    const newList = [...list];
    const [item] = newList.splice(from, 1);
    newList.splice(to, 0, item);
    setConfig({ ...config!, [field]: newList });
  }

  if (loading || !config) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card><CardHeader><Skeleton className="h-6 w-40" /></CardHeader><CardContent><Skeleton className="h-10 w-64" /></CardContent></Card>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><CardHeader><Skeleton className="h-6 w-40" /></CardHeader><CardContent className="space-y-2">{Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-10 w-full" />)}</CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Assignment Settings</h1>
        <p className="text-muted-foreground">
          Configure the auto-assignment algorithm
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History Lookback</CardTitle>
          <CardDescription>
            How far back to look when determining a repeat volunteer&apos;s preferred
            duty
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={config.history_lookback}
            onValueChange={(v) =>
              setConfig({ ...config, history_lookback: v })
            }
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_season">Current Season</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="last_5">Last 5 Drives</SelectItem>
              <SelectItem value="last_10">Last 10 Drives</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {(["male", "female"] as const).map((gender) => {
          const field =
            gender === "male"
              ? "male_priority_order"
              : "female_priority_order";
          const order = config[field as keyof typeof config] as string[];
          return (
            <Card key={gender}>
              <CardHeader>
                <CardTitle className="capitalize">
                  {gender} Duty Priority
                </CardTitle>
                <CardDescription>
                  Order in which duties are tried for first-time {gender}{" "}
                  volunteers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {order.map((slug, i) => (
                    <div
                      key={slug}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm font-medium">{slug}</span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={i === 0}
                          onClick={() =>
                            moveItem(
                              order,
                              i,
                              i - 1,
                              field as "male_priority_order" | "female_priority_order",
                            )
                          }
                        >
                          Up
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={i === order.length - 1}
                          onClick={() =>
                            moveItem(
                              order,
                              i,
                              i + 1,
                              field as "male_priority_order" | "female_priority_order",
                            )
                          }
                        >
                          Down
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <Label className="text-base">Waitlist Auto-Fill</Label>
            <p className="text-sm text-muted-foreground">
              Automatically promote waitlisted volunteers when capacity opens up
            </p>
          </div>
          <Switch
            checked={config.waitlist_auto_fill}
            onCheckedChange={(v) =>
              setConfig({ ...config, waitlist_auto_fill: v })
            }
          />
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
        ) : (
          "Save Settings"
        )}
      </Button>
    </div>
  );
}
