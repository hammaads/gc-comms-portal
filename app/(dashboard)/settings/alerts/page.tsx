"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AlertSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "alerts")
        .single();
      if (data?.value) setConfig(data.value);
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("app_config")
      .update({ value: config })
      .eq("key", "alerts");
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Alert settings saved");
  }

  if (loading || !config) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card>
          <CardHeader><Skeleton className="h-6 w-32" /><Skeleton className="h-4 w-80" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alert Settings</h1>
        <p className="text-muted-foreground">
          Configure when alerts fire on the live dashboard
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deficit Alerts</CardTitle>
          <CardDescription>
            Alert when the percentage of unconfirmed/cancelled volunteers exceeds
            this threshold
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Deficit Threshold (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={config.deficit_threshold_percent}
              onChange={(e) =>
                setConfig({
                  ...config,
                  deficit_threshold_percent: parseInt(e.target.value),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Notify Admins</Label>
              <p className="text-sm text-muted-foreground">
                Show alert banner on the live dashboard
              </p>
            </div>
            <Switch
              checked={config.notify_admins}
              onCheckedChange={(v) =>
                setConfig({ ...config, notify_admins: v })
              }
            />
          </div>
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
