/**
 * venues.ts — Static geo directory of UAE cinema locations.
 *
 * The scrapers only give us venue names, so this hand-maintained list supplies
 * lat/lng for each mall/cinema plus CITY_CENTERS for city-level fallback.
 * distanceKm() is a Haversine helper; nearestVenues()/filmDistanceKm() power
 * the "cinemas near you" UI and nearest-first showtime sorting.
 */
import type { CinemaKey } from "@/lib/cinemas";

export type Venue = {
  cinema: CinemaKey;
  name: string;
  city: string;
  lat: number;
  lng: number;
};

/** Major UAE cinema locations used for "near me" suggestions. */
export const VENUES: Venue[] = [
  // VOX
  { cinema: "vox", name: "Mall of the Emirates", city: "Dubai", lat: 25.1181, lng: 55.2004 },
  { cinema: "vox", name: "City Centre Deira", city: "Dubai", lat: 25.2523, lng: 55.3316 },
  { cinema: "vox", name: "City Centre Mirdif", city: "Dubai", lat: 25.2166, lng: 55.4088 },
  { cinema: "vox", name: "Burjuman", city: "Dubai", lat: 25.2544, lng: 55.3025 },
  { cinema: "vox", name: "Nakheel Mall", city: "Dubai", lat: 25.1132, lng: 55.1391 },
  { cinema: "vox", name: "City Centre Ajman", city: "Ajman", lat: 25.4032, lng: 55.4794 },
  { cinema: "vox", name: "City Centre Sharjah", city: "Sharjah", lat: 25.3268, lng: 55.3925 },
  { cinema: "vox", name: "Abu Dhabi Mall", city: "Abu Dhabi", lat: 24.4959, lng: 54.3833 },
  { cinema: "vox", name: "Yas Mall", city: "Abu Dhabi", lat: 24.4884, lng: 54.6072 },
  { cinema: "vox", name: "Al Jimi Mall", city: "Al Ain", lat: 24.2258, lng: 55.7326 },
  { cinema: "vox", name: "Al Hamra Mall", city: "Ras Al Khaimah", lat: 25.6862, lng: 55.7838 },
  { cinema: "vox", name: "City Centre Fujairah", city: "Fujairah", lat: 25.1215, lng: 56.3319 },

  // Reel
  { cinema: "reel", name: "The Dubai Mall", city: "Dubai", lat: 25.1975, lng: 55.2796 },
  { cinema: "reel", name: "Dubai Marina Mall", city: "Dubai", lat: 25.0772, lng: 55.1401 },
  { cinema: "reel", name: "The Springs Souk", city: "Dubai", lat: 25.0666, lng: 55.1841 },
  { cinema: "reel", name: "Al Ghurair Centre", city: "Dubai", lat: 25.2707, lng: 55.3181 },
  { cinema: "reel", name: "Jebel Ali Recreation Club", city: "Dubai", lat: 25.0186, lng: 55.0644 },

  // Novo
  { cinema: "novo", name: "Dragon Mart", city: "Dubai", lat: 25.1766, lng: 55.4173 },
  { cinema: "novo", name: "Al Ghurair Centre", city: "Dubai", lat: 25.2707, lng: 55.3181 },
  { cinema: "novo", name: "Sahara Centre", city: "Sharjah", lat: 25.3236, lng: 55.3927 },
  { cinema: "novo", name: "Mega Mall", city: "Sharjah", lat: 25.3308, lng: 55.3872 },
  { cinema: "novo", name: "Buhairah Centre", city: "Sharjah", lat: 25.3313, lng: 55.3866 },
  { cinema: "novo", name: "Manar Mall", city: "Ras Al Khaimah", lat: 25.7826, lng: 55.9503 },
  { cinema: "novo", name: "BAS Mall - Baniyas", city: "Abu Dhabi", lat: 24.3079, lng: 54.6314 },
  { cinema: "novo", name: "World Trade Centre Mall", city: "Abu Dhabi", lat: 24.4899, lng: 54.3577 },

  // Roxy
  { cinema: "roxy", name: "Roxy City Walk", city: "Dubai", lat: 25.2048, lng: 55.2622 },
  { cinema: "roxy", name: "Roxy The Beach JBR", city: "Dubai", lat: 25.0785, lng: 55.1338 },
  { cinema: "roxy", name: "Roxy Dubai Hills Mall", city: "Dubai", lat: 25.1032, lng: 55.2481 },
  { cinema: "roxy", name: "Roxy Boxpark", city: "Dubai", lat: 25.1961, lng: 55.2515 },
  { cinema: "roxy", name: "Roxy Al Khawaneej", city: "Dubai", lat: 25.2438, lng: 55.4802 },
];

export type Coords = { lat: number; lng: number };

/** Approximate city centres, used when precise location isn't available. */
export const CITY_CENTERS: Record<string, Coords> = {
  Dubai: { lat: 25.2048, lng: 55.2708 },
  "Abu Dhabi": { lat: 24.4539, lng: 54.3773 },
  Sharjah: { lat: 25.3463, lng: 55.4209 },
  Ajman: { lat: 25.4052, lng: 55.5136 },
  "Ras Al Khaimah": { lat: 25.7895, lng: 55.9432 },
  Fujairah: { lat: 25.1288, lng: 56.3265 },
  "Umm Al Quwain": { lat: 25.5647, lng: 55.5532 },
  "Al Ain": { lat: 24.2075, lng: 55.7447 },
};


export function distanceKm(a: Coords, b: Coords): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type NearbyVenue = Venue & { distanceKm: number };

export function nearestVenues(coords: Coords, limit = 6): NearbyVenue[] {
  return VENUES.map((venue) => ({ ...venue, distanceKm: distanceKm(coords, venue) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when any of a film's venue names matches one of the nearby venues. */
export function matchesVenues(filmVenues: string[], venues: NearbyVenue[]) {
  const targets = venues.map((v) => normalize(v.name));
  return filmVenues.some((raw) => {
    const name = normalize(raw);
    return targets.some((target) => name.includes(target) || target.includes(name));
  });
}

/**
 * Distance to a single named screen, matched across every chain.
 *
 * Showtime rows carry a venue name but no chain, so this matches on name alone.
 * Where a name is ambiguous across chains the nearest match wins, which is the
 * right answer for ordering a list nearest-first.
 */
export function venueDistanceKm(venueName: string, coords: Coords): number | null {
  const name = normalize(venueName);
  if (!name) return null;
  const matched = VENUES.filter((v) => {
    const target = normalize(v.name);
    return name.includes(target) || target.includes(name);
  });
  if (matched.length === 0) return null;
  return Math.min(...matched.map((v) => distanceKm(coords, v)));
}

const FORMAT_ORDER = ["IMAX", "4DX", "MAX", "3D", "2D"];
export const KNOWN_FORMATS = FORMAT_ORDER;

/**
 * Distance from `coords` to the closest screen of a film: prefers venues named
 * on the film, falls back to any venue of that chain.
 */
export function filmDistanceKm(
  cinema: string,
  filmVenues: string[],
  coords: Coords,
): number | null {
  const chain = VENUES.filter((v) => v.cinema === cinema);
  if (chain.length === 0) return null;
  const named = filmVenues.length
    ? chain.filter((v) => {
        const target = normalize(v.name);
        return filmVenues.some((raw) => {
          const name = normalize(raw);
          return name.includes(target) || target.includes(name);
        });
      })
    : [];
  const pool = named.length > 0 ? named : chain;
  return Math.min(...pool.map((v) => distanceKm(coords, v)));
}
