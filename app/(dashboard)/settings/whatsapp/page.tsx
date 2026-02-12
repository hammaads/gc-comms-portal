"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Wifi, WifiOff, QrCode, RefreshCw } from "lucide-react";

export default function WhatsAppSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("whatsapp-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_sessions" },
        () => loadSession(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadData() {
    await Promise.all([loadConfig(), loadSession()]);
    setLoading(false);
  }

  async function loadConfig() {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "whatsapp")
      .single();
    if (data?.value) setConfig(data.value);
  }

  async function loadSession() {
    const { data } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .limit(1)
      .single();
    setSession(data);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("app_config")
      .update({ value: config })
      .eq("key", "whatsapp");
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  async function requestQR() {
    const railwayUrl = process.env.NEXT_PUBLIC_RAILWAY_SERVICE_URL;
    if (!railwayUrl) {
      toast.error("Railway service URL not configured");
      return;
    }
    toast.info("Requesting QR code from WhatsApp service...");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
          <CardContent><Skeleton className="h-16 w-full" /></CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
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
        <h1 className="text-2xl font-bold">WhatsApp Settings</h1>
        <p className="text-muted-foreground">
          Manage Baileys WhatsApp connection and messaging
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {session?.status === "connected" ? (
              <>
                <Wifi className="h-6 w-6 text-green-500" />
                <div>
                  <StatusBadge status="confirmed" />
                  {session.phone_number && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.phone_number}
                    </p>
                  )}
                </div>
              </>
            ) : session?.status === "qr_pending" ? (
              <>
                <QrCode className="h-6 w-6 text-yellow-500" />
                <div>
                  <StatusBadge status="in_progress" />
                  {session.qr_code && (
                    <div className="mt-4 rounded-md border p-4 bg-white">
                      <p className="text-sm text-muted-foreground mb-2">
                        Scan this QR code with WhatsApp on your phone:
                      </p>
                      <pre className="text-xs break-all">{session.qr_code}</pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <WifiOff className="h-6 w-6 text-red-500" />
                <div>
                  <StatusBadge status="cancelled" />
                  <p className="text-sm text-muted-foreground mt-1">
                    Connect via Railway service
                  </p>
                </div>
              </>
            )}
            <Button variant="outline" className="ml-auto" onClick={requestQR}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      {config && (
        <>
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <Label className="text-base">Enable WhatsApp</Label>
                <p className="text-sm text-muted-foreground">
                  Send messages via WhatsApp
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
              <CardTitle>Rate Limiting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Messages per second</Label>
                  <Input
                    type="number"
                    value={config.rate_limit_per_second}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        rate_limit_per_second: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Burst limit</Label>
                  <Input
                    type="number"
                    value={config.rate_limit_burst}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        rate_limit_burst: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Keyword Detection</CardTitle>
              <CardDescription>
                Keywords that trigger confirm/cancel actions (comma-separated)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Confirm Keywords</Label>
                <Input
                  value={config.confirm_keywords?.join(", ")}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      confirm_keywords: e.target.value
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Cancel Keywords</Label>
                <Input
                  value={config.cancel_keywords?.join(", ")}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cancel_keywords: e.target.value
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </>
      )}
    </div>
  );
}
