"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createDrive, fetchSunsetTime, getSuggestedVolunteerTarget } from "../actions";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { FormField } from "@/components/ui/form-field";
import { FormActions } from "@/components/ui/form-actions";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { toast } from "sonner";
import { Loader2, MoonStar, Users } from "lucide-react";

const LocationMap = dynamic(
  () =>
    import("@/components/dashboard/location-map").then(
      (m) => m.LocationMap,
    ),
  { ssr: false },
);

async function getNextAvailableDriveDateForSeason(
  supabase: ReturnType<typeof createClient>,
  season: { id: string; start_date: string; end_date: string },
): Promise<string | null> {
  const { data: drives } = await supabase
    .from("drives")
    .select("drive_date")
    .eq("season_id", season.id)
    .order("drive_date", { ascending: true });

  const takenDates = new Set(
    (drives ?? [])
      .map((d: { drive_date: string | null }) => d.drive_date)
      .filter((d): d is string => !!d),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(season.start_date);
  const end = new Date(season.end_date);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  let current = start < today ? today : start;

  while (current <= end) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    const iso = `${yyyy}-${mm}-${dd}`;
    if (!takenDates.has(iso)) {
      return iso;
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  return null;
}

export default function NewDrivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetchingSunset, setFetchingSunset] = useState(false);
  const [seasonId, setSeasonId] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [sunsetTime, setSunsetTime] = useState("");
  const [sunsetSource, setSunsetSource] = useState("aladhan");
  const [driveDate, setDriveDate] = useState("");
  const [daigCount, setDaigCount] = useState("");
  const [volunteerCount, setVolunteerCount] = useState("");
  const [volunteerManuallyEdited, setVolunteerManuallyEdited] = useState(false);
  const [suggestedVolunteerTarget, setSuggestedVolunteerTarget] = useState<
    number | null
  >(null);
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const locationAddressRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadActiveSeason() {
      const supabase = createClient();
      const { data } = await supabase
        .from("seasons")
        .select("id, start_date, end_date")
        .eq("is_active", true)
        .single();
      if (!data) return;

      setSeasonId(data.id);

      if (data.start_date && data.end_date) {
        const nextDate = await getNextAvailableDriveDateForSeason(
          supabase,
          data as { id: string; start_date: string; end_date: string },
        );
        if (nextDate) {
          await handleDateChange(nextDate);
        }
      }
    }
    loadActiveSeason();
  }, []);

  // Auto-update volunteer target from duty capacity rules when daig count changes (unless manually edited)
  useEffect(() => {
    const parsedDaig = Number(daigCount) || 0;
    if (parsedDaig === 0) {
      setSuggestedVolunteerTarget(null);
      if (!volunteerManuallyEdited) setVolunteerCount("");
      return;
    }
    if (!volunteerManuallyEdited) {
      getSuggestedVolunteerTarget(parsedDaig).then((suggested) => {
        setSuggestedVolunteerTarget(suggested);
        if (suggested != null) setVolunteerCount(String(suggested));
      });
    }
  }, [daigCount, volunteerManuallyEdited]);

  async function handleDateChange(date: string) {
    setDriveDate(date);
    if (!date) return;

    setFetchingSunset(true);
    const time = await fetchSunsetTime(date);
    if (time) {
      setSunsetTime(time);
      setSunsetSource("aladhan");
      toast.success(`Sunset time fetched: ${time}`);
    } else {
      toast.error("Could not fetch sunset time. Enter manually.");
      setSunsetSource("manual");
    }
    setFetchingSunset(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("season_id", seasonId);
    formData.set("arrival_time", arrivalTime);
    formData.set("sunset_time", sunsetTime);
    formData.set("sunset_source", sunsetSource);

    const result = await createDrive(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      posthog.capture("drive_created", {
        drive_date: formData.get("drive_date"),
        daig_count: Number(daigCount) || 0,
        volunteer_target: Number(volunteerCount) || null,
        status: formData.get("status"),
        has_location: locationLat !== null && locationLng !== null,
      });
      toast.success("Drive created successfully!");
      router.push("/drives");
    }
  }

  const parsedDaigCount = Number(daigCount) || 0;

  // Attach Google Places Autocomplete once the library is available
  useEffect(() => {
    if (!locationAddressRef.current) return;
    let cancelled = false;

    async function init() {
      // Wait for the Google Maps core script to appear
      while (!(window as any).google?.maps?.importLibrary) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (cancelled) return;

      await google.maps.importLibrary("places");
      if (cancelled || !locationAddressRef.current) return;

      const bounds = new google.maps.LatLngBounds(
        { lat: 24.75, lng: 66.90 },
        { lat: 25.10, lng: 67.30 },
      );

      const autocomplete = new google.maps.places.Autocomplete(
        locationAddressRef.current as HTMLInputElement,
        {
          bounds,
          strictBounds: true,
          componentRestrictions: { country: "pk" },
          fields: ["geometry", "formatted_address", "name"],
        },
      );

      autocomplete.setBounds(bounds);

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setLocationLat(lat);
        setLocationLng(lng);

        const formatted = place.formatted_address;
        if (
          formatted &&
          locationAddressRef.current &&
          !locationAddressRef.current.value
        ) {
          locationAddressRef.current.value = formatted;
        }
      });
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6 page-fade-in">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
        <Card className="border-0 shadow-none">
          <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Create New Drive</CardTitle>
                <CardDescription>
                  Set up an iftaar drive. Sunset time will be auto-fetched from
                  Aladhan API for Karachi.
                </CardDescription>
              </div>
              <FormField className="w-auto self-start">
                <Select name="status" defaultValue="draft">
                  <SelectTrigger className="bg-secondary/60">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start">
                    <SelectItem value="draft" className="flex items-center gap-2">
                      <span className="flex items-center gap-2">
                        <MoonStar className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">Planning</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="open" className="flex items-center gap-2">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-emerald-500" />
                        <span className="font-medium">Scheduled</span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
                label="Drive Name"
                htmlFor="name"
                required
                description="Give this drive a clear, descriptive name."
              >
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., Iftaar Drive #1 - Saddar"
                  required
                />
              </FormField>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Date" htmlFor="drive_date" required>
                  <input type="hidden" name="drive_date" value={driveDate} />
                  <DatePicker
                    id="drive_date"
                    value={driveDate}
                    onChange={handleDateChange}
                  />
                </FormField>
                <FormField label="Arrival Time" htmlFor="arrival_time">
                  <input
                    type="hidden"
                    name="arrival_time"
                    value={arrivalTime}
                  />
                  <TimePicker
                    id="arrival_time"
                    value={arrivalTime}
                    onChange={setArrivalTime}
                    placeholder="Pick arrival time"
                  />
                </FormField>
                <FormField
                  label={
                    <>
                      Sunset Time
                      {fetchingSunset && (
                        <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />
                      )}
                    </>
                  }
                  htmlFor="sunset_time"
                >
                  <input type="hidden" name="sunset_time" value={sunsetTime} />
                  <TimePicker
                    id="sunset_time"
                    value={sunsetTime}
                    onChange={(v) => {
                      setSunsetTime(v);
                      setSunsetSource("manual");
                    }}
                    placeholder="Pick sunset time"
                  />
                </FormField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Daig Count" htmlFor="daig_count" required>
                  <Input
                    id="daig_count"
                    name="daig_count"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={daigCount}
                    onChange={(e) => setDaigCount(e.target.value)}
                    required
                  />
                </FormField>
                <FormField
                  label="Target Volunteers"
                  htmlFor="volunteer_target"
                  description={
                    suggestedVolunteerTarget != null
                      ? `Suggested: ${suggestedVolunteerTarget} volunteers (matches total duty capacity for ${parsedDaigCount} daig${parsedDaigCount === 1 ? "" : "s"}).`
                      : parsedDaigCount > 0
                        ? "Loading suggestion…"
                        : "Enter daig count to see suggested volunteer target from Duty Board rules."
                  }
                >
                  <Input
                    id="volunteer_target"
                    name="volunteer_target"
                    type="number"
                    min="0"
                    placeholder="Enter planned volunteer count"
                    value={volunteerCount}
                    onChange={(e) => {
                      setVolunteerCount(e.target.value);
                      setVolunteerManuallyEdited(true);
                    }}
                  />
                </FormField>
              </div>

              <FormField
                label="Location Name"
                htmlFor="location_name"
                description="Short name for this drive location (shown to volunteers)."
              >
                <Input
                  id="location_name"
                  name="location_name"
                  placeholder="Askari 3"
                />
              </FormField>

              <FormField
                label="Location Address"
                htmlFor="location_address"
                description="Where will the drive take place? Start typing to search via Google Maps."
              >
                <Input
                  id="location_address"
                  name="location_address"
                  placeholder="Full address..."
                  ref={locationAddressRef}
                />
              </FormField>

              <FormField
                label="Internal Notes"
                htmlFor="notes"
                description="Private notes for coordinators (not shown to volunteers)."
              >
                <Textarea id="notes" name="notes" rows={2} />
              </FormField>

              <FormActions className="pt-4">
                <input
                  type="hidden"
                  name="location_lat"
                  value={locationLat ?? ""}
                />
                <input
                  type="hidden"
                  name="location_lng"
                  value={locationLng ?? ""}
                />
                <Button type="submit" disabled={loading || !seasonId}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Create Drive
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

        <Card className="border-0 shadow-none">
          <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
            <CardTitle>Drive Location</CardTitle>
            <CardDescription>
              Click on the map to drop a pin. Volunteers can open directions in
              Google Maps from the drive detail page.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6">
            <LocationMap
              lat={locationLat}
              lng={locationLng}
              onChange={({ lat, lng }) => {
                setLocationLat(lat);
                setLocationLng(lng);
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
