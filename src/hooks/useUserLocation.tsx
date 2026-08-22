/**
 * useUserLocation — Visitor position used for nearest-cinema sorting.
 *
 * Precise browser geolocation when granted (cached in localStorage under
 * "showsouk:coords" so we don't re-prompt), otherwise the centre of the city
 * chosen in the header ("showsouk:city"). Feeds lib/venues + lib/showtimes.
 */
import { useEffect, useState } from "react";
import { CITY_CENTERS, type Coords } from "@/lib/venues";

const COORDS_KEY = "showsouk:coords";
const CITY_KEY = "showsouk:city";

/**
 * How long a stored fix is trusted. Without an expiry the very first reading
 * was cached forever: someone who allowed location once in Dubai and later
 * opened the site in Sharjah kept being measured from Dubai, and every
 * distance on the page was wrong by the width of the country.
 */
const COORDS_TTL_MS = 30 * 60 * 1000;

type StoredCoords = Coords & { at?: number };

function readCached(): Coords | null {
  try {
    const raw = window.localStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCoords;
    if (typeof parsed.lat !== "number" || typeof parsed.lng !== "number") return null;
    // Undated entries predate the expiry and cannot be aged, so discard them.
    if (!parsed.at || Date.now() - parsed.at > COORDS_TTL_MS) {
      window.localStorage.removeItem(COORDS_KEY);
      return null;
    }
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function writeCached(point: Coords) {
  try {
    window.localStorage.setItem(COORDS_KEY, JSON.stringify({ ...point, at: Date.now() }));
  } catch {
    // Private mode: we simply re-ask next time.
  }
}

/**
 * Where the visitor is: precise browser coordinates when they've been granted
 * (cached so we don't re-prompt on every page), otherwise the centre of the
 * city picked in the header.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [city, setCity] = useState<string>("Dubai");
  const [precise, setPrecise] = useState(false);

  useEffect(() => {
    const storedCity = window.localStorage.getItem(CITY_KEY);
    if (storedCity) setCity(storedCity);

    const cached = readCached();
    if (cached) {
      setCoords(cached);
      setPrecise(true);
      return;
    }
    // City centre is a placeholder, not a location: distances from it can be
    // tens of kilometres out, so `precise` stays false and the UI can say so.
    setCoords(CITY_CENTERS[storedCity ?? "Dubai"] ?? CITY_CENTERS["Dubai"] ?? null);
  }, []);

  /**
   * Single place that talks to the Geolocation API. Callers pass handlers
   * rather than calling getCurrentPosition themselves — a second copy of this
   * previously wrote the cache without a timestamp, which the reader above
   * then discarded, so the fix was thrown away the moment the page reloaded.
   */
  const requestPrecise = (
    onSuccess?: (point: Coords) => void,
    onError?: () => void,
  ) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onError?.();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        writeCached(point);
        setCoords(point);
        setPrecise(true);
        onSuccess?.(point);
      },
      () => onError?.(),
      {
        // We are ranking cinemas by distance, so a GPS-grade fix is worth the
        // extra second. The previous low-accuracy call fell back to network
        // positioning, which in the UAE can land several kilometres away and
        // reorder the entire list.
        enableHighAccuracy: true,
        timeout: 15_000,
        // Never reuse a position the browser cached earlier: a stale fix is
        // exactly the failure this hook is meant to avoid.
        maximumAge: 0,
      },
    );
  };

  return { coords, city, precise, requestPrecise };
}
