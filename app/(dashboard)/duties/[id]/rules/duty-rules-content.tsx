"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";

export function DutyRulesContent({ dutyId }: { dutyId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [duty, setDuty] = useState<Tables<"duties"> | null>(null);
  const [rules, setRules] = useState<Tables<"duty_capacity_rules">[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [dutyRes, rulesRes] = await Promise.all([
      supabase.from("duties").select("*").eq("id", dutyId).single(),
      supabase
        .from("duty_capacity_rules")
        .select("*")
        .eq("duty_id", dutyId)
        .order("created_at"),
    ]);
    if (dutyRes.data) setDuty(dutyRes.data);
    if (rulesRes.data) setRules(rulesRes.data);
    setLoading(false);
  }

  async function saveLinearRule(rule: Tables<"duty_capacity_rules">) {
    setSaving(true);
    const { error } = await supabase
      .from("duty_capacity_rules")
      .update({
        base_count: rule.base_count,
        per_daig_count: rule.per_daig_count,
      })
      .eq("id", rule.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Rule saved");
  }

  async function addTieredRule() {
    const { error } = await supabase.from("duty_capacity_rules").insert({
      duty_id: dutyId,
      capacity_mode: "tiered" as const,
      tier_min_daigs: 0,
      tier_max_daigs: 10,
      tier_capacity: 5,
    });
    if (error) toast.error(error.message);
    else loadData();
  }

  async function updateTierRule(
    id: string,
    field: string,
    value: number | null,
  ) {
    await supabase
      .from("duty_capacity_rules")
      .update({ [field]: value })
      .eq("id", id);
    loadData();
  }

  async function deleteRule(id: string) {
    await supabase.from("duty_capacity_rules").delete().eq("id", id);
    toast.success("Rule deleted");
    loadData();
  }

  function calculatePreview(daigs: number): number {
    const linearRule = rules.find((r) => r.capacity_mode === "linear");
    if (linearRule) {
      return (
        (linearRule.base_count || 0) +
        Math.ceil((linearRule.per_daig_count || 0) * daigs)
      );
    }
    const tieredRules = rules.filter((r) => r.capacity_mode === "tiered");
    const matched = tieredRules.find(
      (r) =>
        (r.tier_min_daigs || 0) <= daigs &&
        (r.tier_max_daigs === null || (r.tier_max_daigs || 0) >= daigs),
    );
    return matched?.tier_capacity || 0;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const linearRule = rules.find((r) => r.capacity_mode === "linear");
  const tieredRules = rules.filter((r) => r.capacity_mode === "tiered");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Capacity Rules: {duty?.name}
        </h1>
        <p className="text-muted-foreground">
          Configure how volunteer capacity is calculated from daig count
        </p>
      </div>

      {linearRule && (
        <Card>
          <CardHeader>
            <CardTitle>Linear Mode</CardTitle>
            <CardDescription>
              capacity = base + ceil(per_daig × daig_count)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Count</Label>
                <Input
                  type="number"
                  value={linearRule.base_count || 0}
                  onChange={(e) => {
                    const updated = {
                      ...linearRule,
                      base_count: parseInt(e.target.value) || 0,
                    };
                    setRules(
                      rules.map((r) => (r.id === linearRule.id ? updated : r)),
                    );
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Per Daig Count</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={linearRule.per_daig_count || 0}
                  onChange={(e) => {
                    const updated = {
                      ...linearRule,
                      per_daig_count: parseFloat(e.target.value) || 0,
                    };
                    setRules(
                      rules.map((r) => (r.id === linearRule.id ? updated : r)),
                    );
                  }}
                />
              </div>
            </div>
            <Button
              onClick={() => saveLinearRule(linearRule)}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tiered Mode</CardTitle>
              <CardDescription>
                Set fixed capacities for daig count ranges
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addTieredRule}>
              <Plus className="mr-1 h-4 w-4" />
              Add Tier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tieredRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tiered rules. Add one to use tiered capacity mode.
            </p>
          ) : (
            <div className="space-y-3">
              {tieredRules.map((rule) => (
                <div key={rule.id} className="flex items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Daigs</Label>
                    <Input
                      type="number"
                      className="w-24"
                      value={rule.tier_min_daigs || 0}
                      onChange={(e) =>
                        updateTierRule(
                          rule.id,
                          "tier_min_daigs",
                          parseInt(e.target.value),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Daigs</Label>
                    <Input
                      type="number"
                      className="w-24"
                      value={rule.tier_max_daigs || ""}
                      onChange={(e) =>
                        updateTierRule(
                          rule.id,
                          "tier_max_daigs",
                          e.target.value ? parseInt(e.target.value) : null,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Capacity</Label>
                    <Input
                      type="number"
                      className="w-24"
                      value={rule.tier_capacity || 0}
                      onChange={(e) =>
                        updateTierRule(
                          rule.id,
                          "tier_capacity",
                          parseInt(e.target.value),
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRule(rule.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2 text-sm">
            {[5, 10, 15, 20, 30].map((daigs) => (
              <div key={daigs} className="rounded border p-3 text-center">
                <div className="text-muted-foreground">{daigs} daigs</div>
                <div className="text-lg font-bold">
                  {calculatePreview(daigs)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => router.back()}>
        Back to Duties
      </Button>
    </div>
  );
}
