"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Moon, Loader2, CheckCircle2 } from "lucide-react";

type Drive = {
  id: string;
  name: string;
  drive_date: string;
  location_name: string | null;
};

export default function VolunteerRegisterPage() {
  const supabase = createClient();
  const [drives, setDrives] = useState<Drive[]>([]);
  const [selectedDrives, setSelectedDrives] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [assignmentInfo, setAssignmentInfo] = useState<string>("");
  const [gender, setGender] = useState<string>("");

  useEffect(() => {
    async function loadDrives() {
      const { data: season } = await supabase
        .from("seasons")
        .select("id")
        .eq("is_active", true)
        .single();
      if (!season) return;

      const { data } = await supabase
        .from("drives")
        .select("id, name, drive_date, location_name")
        .eq("season_id", season.id)
        .in("status", ["open", "draft"])
        .order("drive_date");
      if (data) setDrives(data);
    }
    loadDrives();
  }, []);

  function toggleDrive(driveId: string) {
    setSelectedDrives((prev) =>
      prev.includes(driveId)
        ? prev.filter((id) => id !== driveId)
        : [...prev, driveId],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedDrives.length === 0) return;
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const phone = normalizePhone(formData.get("phone") as string);
    const name = formData.get("name") as string;

    const { data: volunteer, error: volError } = await supabase
      .from("volunteers")
      .upsert(
        {
          phone,
          name,
          email: (formData.get("email") as string) || null,
          gender: gender as "male" | "female",
          organization: (formData.get("organization") as string) || null,
          source: "in_app_form" as const,
        },
        { onConflict: "phone" },
      )
      .select()
      .single();

    if (volError || !volunteer) {
      setLoading(false);
      return;
    }

    for (const driveId of selectedDrives) {
      await supabase
        .from("volunteer_availability")
        .upsert(
          {
            volunteer_id: volunteer.id,
            drive_id: driveId,
            source: "in_app_form" as const,
          },
          { onConflict: "volunteer_id,drive_id" },
        );
    }

    const res = await fetch("/api/public/auto-assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        volunteerId: volunteer.id,
        driveIds: selectedDrives,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.assignments && data.assignments.length > 0) {
        setAssignmentInfo(
          data.assignments
            .map((a: { drive: string; duty: string }) => `${a.drive}: ${a.duty}`)
            .join("\n"),
        );
      }
    }

    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/5 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle2 className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-2xl font-bold">JazakAllah Khair!</h2>
            <p className="text-muted-foreground">
              You have been registered as a volunteer.
            </p>
            {assignmentInfo && (
              <div className="mt-4 rounded-md bg-accent/5 border border-accent/20 p-4 text-left">
                <p className="font-medium mb-2">Your Duty Assignments:</p>
                <pre className="whitespace-pre-wrap text-sm">
                  {assignmentInfo}
                </pre>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              You will receive WhatsApp reminders before each drive.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/5 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Moon className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Grand Citizens</CardTitle>
          <div className="mx-auto my-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px w-8 bg-border" />
            Ramadan 2026
            <span className="h-px w-8 bg-border" />
          </div>
          <CardDescription>
            Sign up to volunteer for our Iftaar Drives in Karachi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" name="name" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="03XX-XXXXXXX"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Gender *</Label>
              <Select value={gender} onValueChange={setGender} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization">
                School / College / University / Company
              </Label>
              <Input id="organization" name="organization" />
            </div>

            <div className="space-y-3">
              <Label>Available Dates *</Label>
              {drives.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming drives available.
                </p>
              ) : (
                <div className="space-y-2">
                  {drives.map((drive) => (
                    <label
                      key={drive.id}
                      className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-primary/5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <Checkbox
                        checked={selectedDrives.includes(drive.id)}
                        onCheckedChange={() => toggleDrive(drive.id)}
                      />
                      <div>
                        <div className="font-medium">{drive.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(drive.drive_date).toLocaleDateString(
                            "en-PK",
                            {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            },
                          )}
                          {drive.location_name && ` — ${drive.location_name}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-start gap-3 pt-2">
              <Checkbox id="agreement" required />
              <Label htmlFor="agreement" className="text-sm leading-normal">
                I agree to volunteer for the selected iftaar drives and will
                fulfill my assigned duties to the best of my ability.
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || selectedDrives.length === 0 || !gender}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing up...
                </>
              ) : (
                "Sign Up as Volunteer"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
