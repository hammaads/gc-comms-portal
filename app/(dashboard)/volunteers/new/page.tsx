"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/utils";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
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
import { FormField } from "@/components/ui/form-field";
import { FormActions } from "@/components/ui/form-actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function NewVolunteerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const phone = normalizePhone(formData.get("phone") as string);

    const { error } = await supabase
      .from("volunteers")
      .upsert(
        {
          phone,
          name: (formData.get("name") as string).trim(),
          email: (formData.get("email") as string) || null,
          gender: formData.get("gender") as "male" | "female",
          organization: (formData.get("organization") as string) || null,
          source: "manual" as const,
          notes: (formData.get("notes") as string) || null,
        },
        { onConflict: "phone" },
      );

    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      posthog.capture("volunteer_added_to_system", {
        gender: formData.get("gender"),
        has_organization: !!(formData.get("organization") as string),
        source: "manual",
      });
      toast.success("Volunteer added");
      router.push("/volunteers");
    }
  }

  return (
    <div className="mx-auto max-w-lg page-fade-in">
      <Card>
        <CardHeader>
          <CardTitle>Add Volunteer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Full Name" htmlFor="name" required>
              <Input id="name" name="name" required />
            </FormField>
            <FormField label="Phone" htmlFor="phone" required>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="03XX-XXXXXXX"
                required
                onInput={(e) => {
                  const input = e.target as HTMLInputElement;
                  input.value = input.value.replace(/[^0-9]/g, "");
                }}
              />
            </FormField>
            <FormField label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" />
            </FormField>
            <FormField label="Gender" required>
              <Select name="gender" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Organization"
              htmlFor="organization"
              description="School, college, company, or other organization (optional)"
            >
              <Input
                id="organization"
                name="organization"
                placeholder="School/College/Company"
              />
            </FormField>
            <FormField label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} />
            </FormField>
            <FormActions>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Volunteer
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </FormActions>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
