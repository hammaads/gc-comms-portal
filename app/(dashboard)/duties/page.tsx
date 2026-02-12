"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, GripVertical, Settings2, Loader2, ClipboardList } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";

export default function DutiesPage() {
  const supabase = createClient();
  const [duties, setDuties] = useState<Tables<"duties">[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDuties();
  }, []);

  async function loadDuties() {
    const { data } = await supabase
      .from("duties")
      .select("*")
      .order("display_order");
    if (data) setDuties(data);
    setLoading(false);
  }

  async function handleCreateDuty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const genderRestriction = formData.get("gender_restriction") as string;

    const { error } = await supabase.from("duties").insert({
      name,
      slug,
      gender_restriction:
        genderRestriction === "none"
          ? null
          : (genderRestriction as "male" | "female"),
      display_order: duties.length + 1,
    });

    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      const { data: newDuty } = await supabase
        .from("duties")
        .select("id")
        .eq("slug", slug)
        .single();
      if (newDuty) {
        await supabase.from("duty_capacity_rules").insert({
          duty_id: newDuty.id,
          capacity_mode: "linear" as const,
          base_count: 2,
          per_daig_count: 0.5,
        });
      }
      toast.success("Duty created");
      setDialogOpen(false);
      loadDuties();
    }
  }

  async function toggleActive(duty: Tables<"duties">) {
    await supabase
      .from("duties")
      .update({ is_active: !duty.is_active })
      .eq("id", duty.id);
    toast.success(
      `${duty.name} ${duty.is_active ? "deactivated" : "activated"}`,
    );
    loadDuties();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-6 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Duties</h1>
          <p className="text-muted-foreground">
            Manage duty types and their capacity rules
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Duty
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateDuty}>
              <DialogHeader>
                <DialogTitle>Create Duty</DialogTitle>
                <DialogDescription>Add a new duty type</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="duty-name">Name</Label>
                  <Input
                    id="duty-name"
                    name="name"
                    placeholder="e.g., Water Distribution"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender Restriction</Label>
                  <Select name="gender_restriction" defaultValue="none">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any Gender</SelectItem>
                      <SelectItem value="male">Male Only</SelectItem>
                      <SelectItem value="female">Female Only</SelectItem>
                    </SelectContent>
                  </Select>
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

      {duties.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No Duties"
          description="Add duty types to start assigning volunteers to roles."
        />
      ) : (
        <div className="space-y-2">
          {duties.map((duty) => (
            <Card
              key={duty.id}
              className={!duty.is_active ? "opacity-50" : undefined}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{duty.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {duty.slug}
                      </Badge>
                      {duty.gender_restriction && (
                        <Badge variant="secondary" className="text-xs">
                          {duty.gender_restriction} only
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/duties/${duty.id}/rules`}>
                    <Button variant="ghost" size="sm">
                      <Settings2 className="mr-1 h-4 w-4" />
                      Rules
                    </Button>
                  </Link>
                  <Switch
                    checked={duty.is_active}
                    onCheckedChange={() => toggleActive(duty)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
