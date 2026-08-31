/**
 * useUserLocation — Visitor position used for nearest-cinema sorting.
 *
 * Precise browser geolocation when granted (cached in localStorage under
 * "showsouk:coords" so we don't re-prompt), otherwise the centre of the city
 * chosen in the header ("showsouk:city"). Feeds lib/venues + lib/showtimes.
 *
 * A granted fix is only used when it is near a screen we list. Outside that,
 * every page fell back to ordering by a distance no one can act on — a visitor
 * abroad saw "2608.6 km away" against each cinema. Those visitors get the
 * city-centre ordering instead, and `outsideServiceArea` so the UI can explain
 * why the location button did nothing.
 */
import { useEffect, useState } from "react";
import { CITY_CENTERS, nearestCity, withinServiceArea, type Coords } from "@/lib/venues";

const COORDS_KEY = "showsouk:coords";
const CITY_KEY = "showsouk:city";

/**
 * Set once the visitor picks a city by hand, so an explicit choice is never
 * overwritten by a location fix. Someone browsing Abu Dhabi from Dubai means it.
 */
const CITY_MANUAL_KEY = "showsouk:city-manual";

/**
 * Fired when a location fix renames the city. The header's picker lives in a
 * different tree from every consumer of this hook, so nothing would otherwise
 * tell it to re-read: a Sharjah visitor got correct Sharjah cinemas under a
 * chip still reading "Dubai", which reads as the site not knowing where they
 * are. `storage` events are no use here — the browser only sends those to
 * *other* tabs, never the one that wrote.
 */
export const CITY_EVENT = "showsouk:city-changed";

/**
 * Name the city after a fix, unless the visitor has chosen one themselves.
 * Returns the name so callers can set their own state from it.
 */
function syncCityToFix(point: Coords): string | null {
  try {
    if (window.localStorage.getItem(CITY_MANUAL_KEY)) return null;
    const detected = nearestCity(point);
    if (window.localStorage.getItem(CITY_KEY) === detected) return detected;
    window.localStorage.setItem(CITY_KEY, detected);
    window.dispatchEvent(new CustomEvent(CITY_EVENT, { detail: detected }));
    return detected;
  } catch {
    // Private mode: the chip keeps its default, which is cosmetic only.
    return null;
  }
}

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
  /**
   * A real fix was obtained, but nowhere near a screen we list. Kept separate
   * from `precise` because the UI needs to tell these apart: "we don't know
   * where you are" invites a location prompt, while "you are 5,000 km from the
   * nearest cinema" makes that button pointless.
   */
  const [outsideServiceArea, setOutsideServiceArea] = useState(false);

  const centreOf = (name: string | null) =>
    CITY_CENTERS[name ?? "Dubai"] ?? CITY_CENTERS["Dubai"] ?? null;

  useEffect(() => {
    const storedCity = window.localStorage.getItem(CITY_KEY);
    if (storedCity) setCity(storedCity);

    const cached = readCached();
    // A cached fix from outside the service area is honoured no more than a
    // fresh one: someone who allowed location abroad would otherwise keep
    // being measured from there for the whole TTL.
    if (cached && withinServiceArea(cached)) {
      setCoords(cached);
      setPrecise(true);
      // A cached fix has to name the city too, or the chip only corrects itself
      // on the visit where permission was granted and reverts on the next one.
      const detected = syncCityToFix(cached);
      if (detected) setCity(detected);
      return;
    }
    if (cached) setOutsideServiceArea(true);
    // City centre is a placeholder, not a location: distances from it can be
    // tens of kilometres out, so `precise` stays false and the UI can say so.
    setCoords(centreOf(storedCity));
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
        // A fix from outside the service area is worse than none: ordering by
        // it is meaningless and the distances read "2608.6 km away". Fall back
        // to the chosen city's centre and say so, rather than caching a
        // position every screen would then be measured from.
        if (!withinServiceArea(point)) {
          setOutsideServiceArea(true);
          setPrecise(false);
          setCoords(centreOf(window.localStorage.getItem(CITY_KEY)));
          onError?.();
          return;
        }
        writeCached(point);
        setCoords(point);
        setPrecise(true);
        setOutsideServiceArea(false);
        const detected = syncCityToFix(point);
        if (detected) setCity(detected);
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

  return { coords, city, precise, outsideServiceArea, requestPrecise };
}
