/**
 * venues.ts Ã¢â‚¬â€ Static geo directory of UAE cinema locations.
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
 * drifts here stops producing a distance Ã¢â‚¬â€ silently, since the UI just omits
 * it. If distances disappear for a chain, check these names against
 *   select distinct s->>'venue' from cinema_films f,
 *     jsonb_array_elements(f.showtimes) s where f.is_active;
 *
 * Coordinates are the mall or complex, accurate to a few hundred metres, which
 * is all "nearest first" needs.
 */
export const VENUES: Venue[] = [
  // VOX
  { cinema: "vox", name: "Mall of The Emirates Cinema", city: "Dubai", lat: 25.118826, lng: 55.198224 },
  { cinema: "vox", name: "Deira City Center Cinema", city: "Dubai", lat: 25.251993, lng: 55.333579 },
  { cinema: "vox", name: "Mirdif City Center Cinema", city: "Dubai", lat: 25.216085, lng: 55.407179 },
  { cinema: "vox", name: "Burjuman Mall Cinema", city: "Dubai", lat: 25.253081, lng: 55.30256 },
  { cinema: "vox", name: "Palm Jumeirah Mall Cinema", city: "Dubai", lat: 25.114283, lng: 55.1386 },
  { cinema: "vox", name: "Dubai Festival City Cinema", city: "Dubai", lat: 25.21984, lng: 55.357844 },
  { cinema: "vox", name: "Grand Hyatt Cinema", city: "Dubai", lat: 25.229285, lng: 55.318948 },
  { cinema: "vox", name: "Wafi City Cinema", city: "Dubai", lat: 25.23083, lng: 55.319171 },
  { cinema: "vox", name: "Mercato Mall Cinema", city: "Dubai", lat: 25.216648, lng: 55.252485 },
  { cinema: "vox", name: "Shindagha City Centre Cinema", city: "Dubai", lat: 25.264676, lng: 55.286233 },
  { cinema: "vox", name: "Kempinski Private Cinema Mall of Emirates", city: "Dubai", lat: 25.118518, lng: 55.19496 },
  { cinema: "vox", name: "City Center Sharjah Cinema", city: "Sharjah", lat: 25.326486, lng: 55.393687 },
  { cinema: "vox", name: "City Center Al Zahia Cinema", city: "Sharjah", lat: 25.315455, lng: 55.454988 },
  { cinema: "vox", name: "City Center Ajman Cinema", city: "Ajman", lat: 25.398759, lng: 55.479452 },
  { cinema: "vox", name: "City Center Fujairah Cinema", city: "Fujairah", lat: 25.126228, lng: 56.302783 },
  { cinema: "vox", name: "Galleria Al Maryah Cinema", city: "Abu Dhabi", lat: 24.501379, lng: 54.390225 },
  { cinema: "vox", name: "Yas Mall Cinema", city: "Abu Dhabi", lat: 24.488738, lng: 54.608925 },
  { cinema: "vox", name: "Abu Dhabi Mall Cinema", city: "Abu Dhabi", lat: 24.496036, lng: 54.382696 },
  { cinema: "vox", name: "Nation Towers Cinema", city: "Abu Dhabi", lat: 24.4635, lng: 54.329232 },
  { cinema: "vox", name: "Reem Mall Cinema", city: "Abu Dhabi", lat: 24.488072, lng: 54.400199 },
  { cinema: "vox", name: "Al Jimi Mall Cinema", city: "Al Ain", lat: 24.243726, lng: 55.726737 },
  { cinema: "vox", name: "Al Hamra Mall Cinema", city: "Ras Al Khaimah", lat: 25.683129, lng: 55.781931 },

  // Reel
  { cinema: "reel", name: "Dubai Mall Cinema", city: "Dubai", lat: 25.203117, lng: 55.279006 },
  { cinema: "reel", name: "Springs Souk Cinema", city: "Dubai", lat: 25.0666, lng: 55.1841 },

  // Novo
  { cinema: "novo", name: "Dragon Mart Cinema", city: "Dubai", lat: 25.174961, lng: 55.417626 },
  { cinema: "novo", name: "Mega Mall Cinema", city: "Sharjah", lat: 25.3448, lng: 55.3987 },
  { cinema: "novo", name: "Sahara Center Cinema", city: "Sharjah", lat: 25.297543, lng: 55.372659 },
  { cinema: "novo", name: "Buhaira Cinema", city: "Sharjah", lat: 25.33208, lng: 55.375704 },
  { cinema: "novo", name: "Manar Mall Cinema", city: "Ras Al Khaimah", lat: 25.785498, lng: 55.965447 },
  { cinema: "novo", name: "Bawabat Al Sharq Mall Cinema", city: "Abu Dhabi", lat: 24.311121, lng: 54.621092 },

  // Roxy
  { cinema: "roxy", name: "City Walk Cinema", city: "Dubai", lat: 25.207635, lng: 55.262574 },
  { cinema: "roxy", name: "The Beach Cinema", city: "Dubai", lat: 25.0785, lng: 55.1338 },
  { cinema: "roxy", name: "Dubai Hills Cinema", city: "Dubai", lat: 25.103583, lng: 55.238916 },
  { cinema: "roxy", name: "Boxpark Cinema", city: "Dubai", lat: 25.202136, lng: 55.250652 },
  { cinema: "roxy", name: "Al Khawaneej Cinema", city: "Dubai", lat: 25.233461, lng: 55.472964 },
  { cinema: "roxy", name: "Circle Mall Cinema", city: "Dubai", lat: 25.0657, lng: 55.2159 },

  // Star
  { cinema: "star", name: "Al Ghurair Centre Cinema", city: "Dubai", lat: 25.267268, lng: 55.31755 },
  { cinema: "star", name: "Junction Mall Cinema", city: "Dubai", lat: 24.995209, lng: 55.152101 },
  { cinema: "star", name: "Grand Mall Cinema", city: "Ajman", lat: 25.392469, lng: 55.438784 },
  { cinema: "star", name: "Mall of UAQ Cinema", city: "Umm Al Quwain", lat: 25.522262, lng: 55.544808 },
  { cinema: "star", name: "Gulf Cinema", city: "Ras Al Khaimah", lat: 25.7946, lng: 55.9732 },
  { cinema: "star", name: "Century Mall Cinema", city: "Fujairah", lat: 25.157385, lng: 56.350397 },
  { cinema: "star", name: "Dana Cinema", city: "Fujairah", lat: 25.130842, lng: 56.328888 },
  { cinema: "star", name: "Wahda Mall Cinema", city: "Abu Dhabi", lat: 24.470432, lng: 54.37245 },
  { cinema: "star", name: "Central Mall Cinema", city: "Abu Dhabi", lat: 24.413202, lng: 54.56625 },
  { cinema: "star", name: "National Cinema", city: "Abu Dhabi", lat: 24.491645, lng: 54.369929 },
  { cinema: "star", name: "Grand Safeer Cinema", city: "Abu Dhabi", lat: 24.343, lng: 54.5305 },
  { cinema: "star", name: "Al Raha Mall Cinema", city: "Abu Dhabi", lat: 24.43872, lng: 54.574433 },
  { cinema: "star", name: "Bawadi Mall Cinema", city: "Al Ain", lat: 24.159206, lng: 55.807493 },
  { cinema: "star", name: "Al Ain Mall Cinema", city: "Al Ain", lat: 24.222193, lng: 55.781395 },
  { cinema: "star", name: "Al Foah Mall Cinema", city: "Al Ain", lat: 24.339521, lng: 55.805063 },
  { cinema: "star", name: "Barari Outlet Mall Cinema", city: "Al Ain", lat: 24.086435, lng: 55.83159 },

  // Cine Royal Ã¢â‚¬â€ Abu Dhabi emirate only
  { cinema: "cineroyal", name: "Deerfields Mall Cinema", city: "Abu Dhabi", lat: 24.523184, lng: 54.670535 },
  { cinema: "cineroyal", name: "Dalma Mall Cinema", city: "Abu Dhabi", lat: 24.333216, lng: 54.525913 },
  { cinema: "cineroyal", name: "World Trade Center Cinema", city: "Abu Dhabi", lat: 24.487402, lng: 54.357022 },
  { cinema: "cineroyal", name: "Khalidiyah Mall Cinema", city: "Abu Dhabi", lat: 24.4699, lng: 54.3518 },
  { cinema: "cineroyal", name: "Al Dhannah Mall Cinema", city: "Abu Dhabi", lat: 24.085727, lng: 52.649733 },

  // Cinema City
  { cinema: "cinemacity", name: "Al Qana Cinema", city: "Abu Dhabi", lat: 24.40265, lng: 54.495842 },
  { cinema: "cinemacity", name: "Arabian Center Cinema", city: "Dubai", lat: 25.234215, lng: 55.433915 },
  { cinema: "cinemacity", name: "Fountain Views Cinema", city: "Dubai", lat: 25.19457, lng: 55.281721 },
  { cinema: "cinemacity", name: "Zero 6 Mall Cinema", city: "Sharjah", lat: 25.290003, lng: 55.498341 },
  { cinema: "cinemacity", name: "Rahmania Mall Cinema", city: "Sharjah", lat: 25.329421, lng: 55.603205 },
  // Both Reel (Dubai Marina) and Cinema City (Abu Dhabi) call a screen
  // "Marina Mall Cinema". Matching is name-only, so a distance for either
  // resolves to whichever is closer to the visitor. Left as-is: it affects a
  // displayed distance, never which link a chip opens.
  { cinema: "reel", name: "Marina Mall Cinema", city: "Dubai", lat: 24.4755, lng: 54.3224 },
  { cinema: "cinemacity", name: "Marina Mall Cinema", city: "Abu Dhabi", lat: 24.4755, lng: 54.3224 },
];

/**
 * "Mall of The Emirates Cinema" -> "mall-of-the-emirates". The trailing
 * "Cinema" is dropped because every venue carries it, so it adds nothing to a
 * URL and makes each one longer for no gain.
 */
export function venueSlug(name: string): string {
  return name
    .replace(/s+Cinema$/i, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

/**
 * Closest screens first. Pass `cinema` to restrict to one chain — the Cinemas
 * page does this whenever its chain filter is set, so the panel answers "the
 * nearest VOX" rather than sitting above VOX-only results listing four other
 * brands. Omit it for the unfiltered board.
 */
export function nearestVenues(
  coords: Coords,
  limit = 6,
  cinema?: CinemaKey | null,
): NearbyVenue[] {
  const pool = cinema ? VENUES.filter((venue) => venue.cinema === cinema) : VENUES;
  return pool
    .map((venue) => ({ ...venue, distanceKm: distanceKm(coords, venue) }))
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
