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

    const cached = window.localStorage.getItem(COORDS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Coords;
        if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
          setCoords(parsed);
          setPrecise(true);
          return;
        }
      } catch {
        // Ignore malformed cache and fall back to the city centre.
      }
    }
    setCoords(CITY_CENTERS[storedCity ?? "Dubai"] ?? CITY_CENTERS["Dubai"] ?? null);
  }, []);

  const requestPrecise = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        window.localStorage.setItem(COORDS_KEY, JSON.stringify(point));
        setCoords(point);
        setPrecise(true);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  return { coords, city, precise, requestPrecise };
}
