"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";

export default function SettingsGeneralPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Tables<"seasons">[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSeasons();
  }, []);

  async function loadSeasons() {
    const { data } = await supabase
      .from("seasons")
      .select("*")
      .order("start_date", { ascending: false });
    if (data) setSeasons(data);
    setLoading(false);
  }

  async function handleCreateSeason(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);

    const { error } = await supabase.from("seasons").insert({
      name: formData.get("name") as string,
      hijri_year: parseInt(formData.get("hijri_year") as string) || null,
      start_date: formData.get("start_date") as string,
      end_date: formData.get("end_date") as string,
      is_active: seasons.length === 0,
    });

    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Season created");
      setDialogOpen(false);
      loadSeasons();
    }
  }

  async function toggleActive(season: Tables<"seasons">) {
    if (season.is_active) return;
    await supabase
      .from("seasons")
      .update({ is_active: false })
      .neq("id", "placeholder");
    await supabase
      .from("seasons")
      .update({ is_active: true })
      .eq("id", season.id);
    toast.success(`${season.name} is now active`);
    loadSeasons();
  }

  async function deleteSeason(id: string) {
    const { error } = await supabase.from("seasons").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Season deleted");
      loadSeasons();
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">General Settings</h1>
        <p className="text-muted-foreground">Manage Ramadan seasons</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Seasons</CardTitle>
              <CardDescription>
                Each season scopes drives, volunteers, and analytics. Only one
                season can be active at a time.
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Season
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreateSeason}>
                  <DialogHeader>
                    <DialogTitle>Create Season</DialogTitle>
                    <DialogDescription>
                      Add a new Ramadan season
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Ramadan 2026"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hijri_year">Hijri Year</Label>
                      <Input
                        id="hijri_year"
                        name="hijri_year"
                        type="number"
                        placeholder="1447"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start_date">Start Date</Label>
                        <Input
                          id="start_date"
                          name="start_date"
                          type="date"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end_date">End Date</Label>
                        <Input
                          id="end_date"
                          name="end_date"
                          type="date"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Hijri Year</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seasons.map((season) => (
                <TableRow key={season.id}>
                  <TableCell className="font-medium">{season.name}</TableCell>
                  <TableCell>{season.hijri_year || "—"}</TableCell>
                  <TableCell>{season.start_date}</TableCell>
                  <TableCell>{season.end_date}</TableCell>
                  <TableCell>
                    {season.is_active ? (
                      <StatusBadge status="active" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(season)}
                      >
                        Set Active
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!season.is_active && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSeason(season.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {seasons.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No seasons yet. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
