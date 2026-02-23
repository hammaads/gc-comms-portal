"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { Navigation } from "lucide-react";

type LocationMapProps = {
  lat?: number | null;
  lng?: number | null;
  onChange?: (coords: { lat: number; lng: number }) => void;
  readOnly?: boolean;
  className?: string;
  /** When true, uses compact height and hides address text (e.g. for cards) */
  compact?: boolean;
  /** When true, hides the "Selected location" line (e.g. when parent shows address) */
  hideAddressText?: boolean;
};

const KARACHI_CENTER = { lat: 24.8607, lng: 67.0011 };

let mapsLibReady = false;

async function ensureMapsLibraries() {
  if (mapsLibReady) return;
  await google.maps.importLibrary("maps");
  await google.maps.importLibrary("marker");
  await google.maps.importLibrary("geocoding");
  await google.maps.importLibrary("places");
  mapsLibReady = true;
}

export function LocationMap({
  lat,
  lng,
  onChange,
  readOnly = false,
  className = "",
  compact = false,
  hideAddressText = false,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [marker, setMarker] = useState<google.maps.Marker | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  const hasLocation = typeof lat === "number" && typeof lng === "number";

  const center = useMemo(
    () =>
      hasLocation
        ? { lat: lat as number, lng: lng as number }
        : KARACHI_CENTER,
    [hasLocation, lat, lng],
  );

  const handleScriptReady = useCallback(async () => {
    try {
      await ensureMapsLibraries();
      setReady(true);
    } catch {
      // API not activated or network error — fail silently
    }
  }, []);

  // Pick up script if already loaded by another component
  useEffect(() => {
    if (
      !ready &&
      typeof window !== "undefined" &&
      (window as any).google?.maps?.importLibrary
    ) {
      handleScriptReady();
    }
  }, [ready, handleScriptReady]);

  // Initialize map once libraries are imported
  useEffect(() => {
    if (!ready || !containerRef.current || map) return;

    const m = new google.maps.Map(containerRef.current, {
      center,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    setMap(m);
  }, [ready, map, center]);

  // Keep center + marker in sync with props
  useEffect(() => {
    if (!map) return;

    map.setCenter(center);

    if (!hasLocation) {
      if (marker) {
        marker.setMap(null);
        setMarker(null);
      }
      setResolvedAddress(null);
      return;
    }

    if (!marker) {
      const mk = new google.maps.Marker({
        position: center,
        map,
      });
      setMarker(mk);
    } else {
      marker.setPosition(center);
      marker.setMap(map);
    }
  }, [map, marker, hasLocation, center.lat, center.lng]);

  // Reverse geocode to a human-readable address when we have a location
  useEffect(() => {
    if (!map || !ready || !hasLocation) {
      setResolvedAddress(null);
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: center }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        setResolvedAddress(results[0].formatted_address ?? null);
      } else {
        setResolvedAddress(null);
      }
    });
  }, [map, ready, hasLocation, center.lat, center.lng]);

  // Allow clicking on the map to choose a location when not read-only
  useEffect(() => {
    if (!map || readOnly) return;

    const listener = map.addListener(
      "click",
      (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };

        if (!marker) {
          const mk = new google.maps.Marker({
            position: coords,
            map,
          });
          setMarker(mk);
        } else {
          marker.setPosition(coords);
          marker.setMap(map);
        }

        onChange?.(coords);
      },
    );

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, marker, readOnly, onChange]);

  // In read-only mode, clicking the marker opens Google Maps directions
  useEffect(() => {
    if (!marker || !readOnly) return;

    const listener = marker.addListener("click", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      const latVal = pos.lat();
      const lngVal = pos.lng();
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${latVal},${lngVal}`,
      )}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [marker, readOnly]);

  return (
    <>
      <Script
        id="google-maps-js"
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&loading=async&language=en`}
        strategy="afterInteractive"
        onLoad={handleScriptReady}
      />
      <div className={className}>
        <div className="relative group/map">
          <div
            ref={containerRef}
            className={`w-full rounded-md border border-border ${compact ? "h-28" : "h-80"}`}
          />
          {readOnly && hasLocation && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  `${lat},${lng}`,
                )}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/map:opacity-100 rounded-md"
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 text-xs font-medium">
                <Navigation className="h-3 w-3" />
                Get directions
              </span>
            </button>
          )}
        </div>
        {hasLocation && !compact && !hideAddressText && (
          <p className="mt-2 text-xs text-muted-foreground">
            Selected location:{" "}
            {resolvedAddress ?? `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`}
          </p>
        )}
      </div>
    </>
  );
}

