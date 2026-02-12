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
import { Loader2, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CallingSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "ai_calling")
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
      .eq("key", "ai_calling");
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  if (loading || !config) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
        <Card><CardHeader><Skeleton className="h-6 w-24" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Calling Settings</h1>
        <p className="text-muted-foreground">
          Configure Retell AI for automated Urdu phone calls
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <Label className="text-base">Enable AI Calling</Label>
            <p className="text-sm text-muted-foreground">
              Allow automated calls to unconfirmed volunteers
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => setConfig({ ...config, enabled: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retell AI Configuration</CardTitle>
          <CardDescription>
            Provider: {config.provider}. Supports Urdu interactive calls at
            ~$0.08/min
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={config.retell_api_key}
              onChange={(e) =>
                setConfig({ ...config, retell_api_key: e.target.value })
              }
              placeholder="key_..."
            />
          </div>
          <div className="space-y-2">
            <Label>Agent ID</Label>
            <Input
              value={config.retell_agent_id}
              onChange={(e) =>
                setConfig({ ...config, retell_agent_id: e.target.value })
              }
              placeholder="agent_..."
            />
          </div>
          <div className="space-y-2">
            <Label>From Number</Label>
            <Input
              value={config.retell_from_number}
              onChange={(e) =>
                setConfig({ ...config, retell_from_number: e.target.value })
              }
              placeholder="+1234567890"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Auto-call hours before sunset</Label>
            <Input
              type="number"
              step="0.5"
              value={config.auto_call_hours_before_sunset}
              onChange={(e) =>
                setConfig({
                  ...config,
                  auto_call_hours_before_sunset: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Stagger delay between calls (ms)</Label>
            <Input
              type="number"
              value={config.stagger_delay_ms}
              onChange={(e) =>
                setConfig({
                  ...config,
                  stagger_delay_ms: parseInt(e.target.value),
                })
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
