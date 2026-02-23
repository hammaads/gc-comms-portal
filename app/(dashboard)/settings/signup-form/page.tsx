"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Copy, Check } from "lucide-react";
import { SkeletonForm } from "@/components/ui/skeleton-form";
import { Skeleton } from "@/components/ui/skeleton";

type WindowMode = "next_n_days" | "next_m_drives" | "manual";

type Config = {
  mode: WindowMode;
  days?: number;
  drive_count?: number;
  start_date?: string;
  end_date?: string;
};

const DEFAULT_CONFIG: Config = {
  mode: "next_n_days",
  days: 7,
};

export default function SignupFormSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "signup_form_window")
        .single();
      if (data?.value) {
        setConfig({ ...DEFAULT_CONFIG, ...(data.value as object) });
      } else {
        setConfig(DEFAULT_CONFIG);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    const value: Config = {
      mode: config.mode,
      days: config.mode === "next_n_days" ? config.days : undefined,
      drive_count: config.mode === "next_m_drives" ? config.drive_count : undefined,
      start_date: config.mode === "manual" ? config.start_date : undefined,
      end_date: config.mode === "manual" ? config.end_date : undefined,
    };
    const { error } = await supabase
      .from("app_config")
      .upsert(
        {
          key: "signup_form_window",
          value,
          description: "Volunteer sign-up form: which drives to show",
        },
        { onConflict: "key" },
      );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  function copyLink() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/volunteer`
        : "/volunteer";
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading || !config) {
    return (
      <div className="space-y-8 page-fade-in max-w-4xl">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <SkeletonForm fields={4} />
      </div>
    );
  }

  return (
    <div className="space-y-8 page-fade-in max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Sign-up Form</h1>
        <p className="text-muted-foreground">
          Configure which drives appear on the public volunteer sign-up form
        </p>
      </div>

      <Card className="stagger-item">
        <CardHeader>
          <CardTitle>Drive window</CardTitle>
          <CardDescription>
            Choose how the list of drives is determined when volunteers open the
            sign-up link
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={config.mode}
              onValueChange={(v: WindowMode) =>
                setConfig({ ...DEFAULT_CONFIG, mode: v })
              }
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="next_n_days">
                  Next N days (e.g. next 7 days)
                </SelectItem>
                <SelectItem value="next_m_drives">
                  Next M drives (e.g. next 2 drives)
                </SelectItem>
                <SelectItem value="manual">
                  Manual date range (from – to)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.mode === "next_n_days" && (
            <div className="space-y-2">
              <Label htmlFor="days">Number of days</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={31}
                value={config.days ?? 7}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    days: Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)),
                  })
                }
                className="w-24"
              />
            </div>
          )}

          {config.mode === "next_m_drives" && (
            <div className="space-y-2">
              <Label htmlFor="drive_count">Number of drives</Label>
              <Input
                id="drive_count"
                type="number"
                min={1}
                max={10}
                value={config.drive_count ?? 2}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    drive_count: Math.max(
                      1,
                      Math.min(10, parseInt(e.target.value, 10) || 1),
                    ),
                  })
                }
                className="w-24"
              />
            </div>
          )}

          {config.mode === "manual" && (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">From date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={config.start_date ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, start_date: e.target.value || undefined })
                  }
                  className="w-40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">To date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={config.end_date ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, end_date: e.target.value || undefined })
                  }
                  className="w-40"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="stagger-item">
        <CardHeader>
          <CardTitle>Public sign-up link</CardTitle>
          <CardDescription>
            Share this link so volunteers can sign up. No login required.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm">
            {typeof window !== "undefined"
              ? `${window.location.origin}/volunteer`
              : "/volunteer"}
          </code>
          <Button variant="outline" size="icon" onClick={copyLink}>
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="border-t border-border pt-6">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
