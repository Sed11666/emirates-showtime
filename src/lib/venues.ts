/**
 * venues.ts â€” Static geo directory of UAE cinema locations.
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

/**
 * Every screen the scrapers currently report, keyed by the venue name exactly
 * as it arrives in `showtimes[].venue`. Matching is name-based, so a name that
 * drifts here stops producing a distance â€” silently, since the UI just omits
 * it. If distances disappear for a chain, check these names against
 *   select distinct s->>'venue' from cinema_films f,
 *     jsonb_array_elements(f.showtimes) s where f.is_active;
 *
 * Coordinates are the mall or complex, accurate to a few hundred metres, which
 * is all "nearest first" needs.
 */
export const VENUES: Venue[] = [
  // VOX
  { cinema: "vox", name: "Mall of The Emirates Cinema", city: "Dubai", lat: 25.1181, lng: 55.2004 },
  { cinema: "vox", name: "Deira City Center Cinema", city: "Dubai", lat: 25.2522, lng: 55.3323 },
  { cinema: "vox", name: "Mirdif City Center Cinema", city: "Dubai", lat: 25.2166, lng: 55.4088 },
  { cinema: "vox", name: "Burjuman Mall Cinema", city: "Dubai", lat: 25.2544, lng: 55.3025 },
  { cinema: "vox", name: "Palm Jumeirah Mall Cinema", city: "Dubai", lat: 25.1132, lng: 55.1391 },
  { cinema: "vox", name: "Dubai Festival City Cinema", city: "Dubai", lat: 25.2224, lng: 55.3536 },
  { cinema: "vox", name: "Grand Hyatt Cinema", city: "Dubai", lat: 25.2279, lng: 55.3284 },
  { cinema: "vox", name: "Wafi City Cinema", city: "Dubai", lat: 25.2311, lng: 55.317 },
  { cinema: "vox", name: "Mercato Mall Cinema", city: "Dubai", lat: 25.22, lng: 55.256 },
  { cinema: "vox", name: "Shindagha City Centre Cinema", city: "Dubai", lat: 25.268, lng: 55.292 },
  { cinema: "vox", name: "Kempinski Private Cinema Mall of Emirates", city: "Dubai", lat: 25.1181, lng: 55.2004 },
  { cinema: "vox", name: "City Center Sharjah Cinema", city: "Sharjah", lat: 25.3268, lng: 55.3925 },
  { cinema: "vox", name: "City Center Al Zahia Cinema", city: "Sharjah", lat: 25.3174, lng: 55.455 },
  { cinema: "vox", name: "City Center Ajman Cinema", city: "Ajman", lat: 25.3997, lng: 55.4791 },
  { cinema: "vox", name: "City Center Fujairah Cinema", city: "Fujairah", lat: 25.1215, lng: 56.3319 },
  { cinema: "vox", name: "Galleria Al Maryah Cinema", city: "Abu Dhabi", lat: 24.5008, lng: 54.3897 },
  { cinema: "vox", name: "Yas Mall Cinema", city: "Abu Dhabi", lat: 24.4884, lng: 54.6072 },
  { cinema: "vox", name: "Abu Dhabi Mall Cinema", city: "Abu Dhabi", lat: 24.4959, lng: 54.3833 },
  { cinema: "vox", name: "Nation Towers Cinema", city: "Abu Dhabi", lat: 24.4669, lng: 54.3336 },
  { cinema: "vox", name: "Reem Mall Cinema", city: "Abu Dhabi", lat: 24.4884, lng: 54.4006 },
  { cinema: "vox", name: "Al Jimi Mall Cinema", city: "Al Ain", lat: 24.2442, lng: 55.7267 },
  { cinema: "vox", name: "Al Hamra Mall Cinema", city: "Ras Al Khaimah", lat: 25.6862, lng: 55.7838 },

  // Reel
  { cinema: "reel", name: "Dubai Mall Cinema", city: "Dubai", lat: 25.1975, lng: 55.2796 },
  { cinema: "reel", name: "Springs Souk Cinema", city: "Dubai", lat: 25.0666, lng: 55.1841 },

  // Novo
  { cinema: "novo", name: "Dragon Mart Cinema", city: "Dubai", lat: 25.1766, lng: 55.4173 },
  { cinema: "novo", name: "Mega Mall Cinema", city: "Sharjah", lat: 25.3448, lng: 55.3987 },
  { cinema: "novo", name: "Sahara Center Cinema", city: "Sharjah", lat: 25.2988, lng: 55.3716 },
  { cinema: "novo", name: "Buhaira Cinema", city: "Sharjah", lat: 25.3229, lng: 55.3821 },
  { cinema: "novo", name: "Manar Mall Cinema", city: "Ras Al Khaimah", lat: 25.7849, lng: 55.9657 },
  { cinema: "novo", name: "Bawabat Al Sharq Mall Cinema", city: "Abu Dhabi", lat: 24.3119, lng: 54.6188 },

  // Roxy
  { cinema: "roxy", name: "City Walk Cinema", city: "Dubai", lat: 25.2048, lng: 55.2622 },
  { cinema: "roxy", name: "The Beach Cinema", city: "Dubai", lat: 25.0785, lng: 55.1338 },
  { cinema: "roxy", name: "Dubai Hills Cinema", city: "Dubai", lat: 25.0974, lng: 55.2684 },
  { cinema: "roxy", name: "Boxpark Cinema", city: "Dubai", lat: 25.1961, lng: 55.2515 },
  { cinema: "roxy", name: "Al Khawaneej Cinema", city: "Dubai", lat: 25.227, lng: 55.5216 },
  { cinema: "roxy", name: "Circle Mall Cinema", city: "Dubai", lat: 25.0657, lng: 55.2159 },

  // Star
  { cinema: "star", name: "Al Ghurair Centre Cinema", city: "Dubai", lat: 25.2682, lng: 55.3174 },
  { cinema: "star", name: "Junction Mall Cinema", city: "Dubai", lat: 25.295, lng: 55.372 }, // UNVERIFIED — estimate; no geocoder has this mall
  { cinema: "star", name: "Grand Mall Cinema", city: "Ajman", lat: 25.3927, lng: 55.4392 },
  { cinema: "star", name: "Mall of UAQ Cinema", city: "Umm Al Quwain", lat: 25.5209, lng: 55.544 },
  { cinema: "star", name: "Gulf Cinema", city: "Ras Al Khaimah", lat: 25.7946, lng: 55.9732 },
  { cinema: "star", name: "Century Mall Cinema", city: "Fujairah", lat: 25.1573, lng: 56.3499 },
  { cinema: "star", name: "Dana Cinema", city: "Fujairah", lat: 25.13, lng: 56.335 }, // UNVERIFIED — estimate; no geocoder has this mall
  { cinema: "star", name: "Wahda Mall Cinema", city: "Abu Dhabi", lat: 24.4703, lng: 54.3742 },
  { cinema: "star", name: "Central Mall Cinema", city: "Abu Dhabi", lat: 24.488, lng: 54.361 }, // UNVERIFIED — estimate; no geocoder has this mall
  { cinema: "star", name: "National Cinema", city: "Abu Dhabi", lat: 24.4524, lng: 54.6407 },
  { cinema: "star", name: "Grand Safeer Cinema", city: "Abu Dhabi", lat: 24.343, lng: 54.5305 },
  { cinema: "star", name: "Al Raha Mall Cinema", city: "Abu Dhabi", lat: 24.439, lng: 54.5741 },
  { cinema: "star", name: "Bawadi Mall Cinema", city: "Al Ain", lat: 24.1601, lng: 55.8078 },
  { cinema: "star", name: "Al Ain Mall Cinema", city: "Al Ain", lat: 24.2328, lng: 55.7741 },
  { cinema: "star", name: "Al Foah Mall Cinema", city: "Al Ain", lat: 24.279, lng: 55.809 }, // UNVERIFIED — estimate; no geocoder has this mall
  { cinema: "star", name: "Barari Outlet Mall Cinema", city: "Al Ain", lat: 24.262, lng: 55.705 }, // UNVERIFIED — estimate; no geocoder has this mall

  // Cine Royal â€” Abu Dhabi emirate only
  { cinema: "cineroyal", name: "Deerfields Mall Cinema", city: "Abu Dhabi", lat: 24.5245, lng: 54.6734 },
  { cinema: "cineroyal", name: "Dalma Mall Cinema", city: "Abu Dhabi", lat: 24.3336, lng: 54.5239 },
  { cinema: "cineroyal", name: "World Trade Center Cinema", city: "Abu Dhabi", lat: 24.4899, lng: 54.3577 },
  { cinema: "cineroyal", name: "Khalidiyah Mall Cinema", city: "Abu Dhabi", lat: 24.4699, lng: 54.3518 },
  { cinema: "cineroyal", name: "Al Dhannah Mall Cinema", city: "Abu Dhabi", lat: 24.0755, lng: 52.672 },

  // Cinema City
  { cinema: "cinemacity", name: "Al Qana Cinema", city: "Abu Dhabi", lat: 24.3948, lng: 54.7143 },
  { cinema: "cinemacity", name: "Arabian Center Cinema", city: "Dubai", lat: 25.232, lng: 55.431 },
  { cinema: "cinemacity", name: "Fountain Views Cinema", city: "Dubai", lat: 25.195, lng: 55.276 },
  { cinema: "cinemacity", name: "Zero 6 Mall Cinema", city: "Sharjah", lat: 25.283, lng: 55.464 }, // UNVERIFIED — estimate; no geocoder has this mall
  { cinema: "cinemacity", name: "Rahmania Mall Cinema", city: "Sharjah", lat: 25.296, lng: 55.455 }, // UNVERIFIED — estimate; no geocoder has this mall
  // Both Reel (Dubai Marina) and Cinema City (Abu Dhabi) call a screen
  // "Marina Mall Cinema". Matching is name-only, so a distance for either
  // resolves to whichever is closer to the visitor. Left as-is: it affects a
  // displayed distance, never which link a chip opens.
  { cinema: "reel", name: "Marina Mall Cinema", city: "Dubai", lat: 25.0772, lng: 55.1401 },
  { cinema: "cinemacity", name: "Marina Mall Cinema", city: "Abu Dhabi", lat: 24.476, lng: 54.322 },
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
