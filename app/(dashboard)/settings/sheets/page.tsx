"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, RefreshCw, FileSpreadsheet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/supabase/types";

export default function SheetsSettingsPage() {
  const supabase = createClient();
  const [syncs, setSyncs] = useState<Tables<"google_sheets_sync">[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSheetId, setNewSheetId] = useState("");
  const [newSheetName, setNewSheetName] = useState("");

  useEffect(() => {
    loadSyncs();
  }, []);

  async function loadSyncs() {
    const { data } = await supabase
      .from("google_sheets_sync")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setSyncs(data);
    setLoading(false);
  }

  async function addSheet() {
    if (!newSheetId) return;
    const { error } = await supabase.from("google_sheets_sync").insert({
      sheet_id: newSheetId,
      sheet_name: newSheetName || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Sheet added for sync");
      setNewSheetId("");
      setNewSheetName("");
      loadSyncs();
    }
  }

  async function triggerSync(id: string) {
    toast.info("Sync triggered - Railway service will process shortly");
    // Would call Railway service
  }

  async function deleteSync(id: string) {
    await supabase.from("google_sheets_sync").delete().eq("id", id);
    toast.success("Removed");
    loadSyncs();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Card>
          <CardHeader><Skeleton className="h-6 w-24" /><Skeleton className="h-4 w-72" /></CardHeader>
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
        <h1 className="text-2xl font-bold">Google Sheets Sync</h1>
        <p className="text-muted-foreground">
          Configure Google Form response sheets for volunteer signup sync
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Sheet</CardTitle>
          <CardDescription>
            Enter the Google Sheet ID (from the URL) and optionally the tab name
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sheet ID</Label>
              <Input
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                value={newSheetId}
                onChange={(e) => setNewSheetId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Sheet Name (tab)</Label>
              <Input
                placeholder="Form Responses 1"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={addSheet} disabled={!newSheetId}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Add Sheet
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {syncs.map((sync) => (
          <Card key={sync.id}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium font-mono text-sm">
                  {sync.sheet_id}
                </p>
                {sync.sheet_name && (
                  <p className="text-sm text-muted-foreground">
                    Tab: {sync.sheet_name}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Last synced row: {sync.last_synced_row}</span>
                  {sync.last_synced_at && (
                    <span>
                      at {new Date(sync.last_synced_at).toLocaleString("en-PK")}
                    </span>
                  )}
                </div>
                {sync.sync_errors && (
                  <Badge variant="destructive" className="mt-1">
                    Errors
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerSync(sync.id)}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Sync Now
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => deleteSync(sync.id)}
                >
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {syncs.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            No sheets configured
          </p>
        )}
      </div>
    </div>
  );
}
