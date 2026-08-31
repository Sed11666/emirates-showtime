/**
 * showtimes.ts — Turns raw scraped showtimes into venue-grouped, distance-aware
 * blocks for the movie detail page (/movie/$slug).
 *
 * Flow: CinemaFilm rows (lib/cinemas.ts) -> venueBlocks() -> VenueBlock[] where
 * each block is one physical cinema (matched against lib/venues.ts for lat/lng)
 * with its screenings sorted by time. Blocks are ordered nearest-first when the
 * visitor's coordinates are known (hooks/useUserLocation).
 *
 * Booking link fallback order: per-screening URL -> venue film URL -> film source URL.
 */
import { isScreeningOver, parseDayKey, timeToMinutes } from "@/lib/days";
import type { CinemaFilm } from "@/lib/cinemas";
import { distanceKm, VENUES, type Coords } from "@/lib/venues";

export type Screening = {
  time: string;
  minutes: number;
  format: string | null;
  bookingUrl: string | null;
};

export type VenueBlock = {
  key: string;
  cinema: string;
  venue: string;
  city: string | null;
  distanceKm: number | null;
  bookingUrl: string | null;
  screenings: Screening[];
};

// Moved to lib/days.ts so the read layer and the "already started" filter share
// one definition of what a clock time means. Re-exported for existing callers.
export { timeToMinutes } from "@/lib/days";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Coordinates for a named screen, falling back to any screen of that chain. */
function venueDistance(cinema: string, venue: string, coords: Coords | null): number | null {
  if (!coords) return null;
  const chain = VENUES.filter((v) => v.cinema === cinema);
  if (chain.length === 0) return null;
  const name = normalize(venue);
  const matched = chain.filter((v) => {
    const target = normalize(v.name);
    return name.includes(target) || target.includes(name);
  });
  const pool = matched.length > 0 ? matched : chain;
  return Math.min(...pool.map((v) => distanceKm(coords, v)));
}

function venueCity(cinema: string, venue: string): string | null {
  const name = normalize(venue);
  const found = VENUES.find((v) => {
    if (v.cinema !== cinema) return false;
    const target = normalize(v.name);
    return name.includes(target) || target.includes(name);
  });
  return found?.city ?? null;
}

/**
 * One block per cinema screen for a single film across every chain, ordered
 * nearest-first when we know where the visitor is. Undated screenings count
 * for any day; if a day has no dated match we fall back to the full schedule
 * rather than showing an empty board.
 */
export function venueBlocks(films: CinemaFilm[], dayKey: string, coords: Coords | null): VenueBlock[] {
  const build = (filterDay: boolean): VenueBlock[] => {
    const groups = new Map<string, VenueBlock>();

    for (const film of films) {
      const entries = Array.isArray(film.showtimes) ? film.showtimes : [];
      for (const entry of entries) {
        let time = "";
        let venue = film.venues[0] ?? "All screens";
        let format: string | null = null;
        let date: string | null = null;
        let screeningUrl: string | null = null;

        if (typeof entry === "string") {
          time = entry.trim();
        } else if (entry && typeof entry === "object") {
          const row = entry as Record<string, unknown>;
          time = typeof row["time"] === "string" ? row["time"].trim() : "";
          date = parseDayKey(row["date"]);
          if (typeof row["venue"] === "string" && row["venue"].trim()) venue = row["venue"].trim();
          if (typeof row["format"] === "string" && row["format"].trim())
            format = row["format"].trim();
          if (typeof row["booking_url"] === "string" && row["booking_url"].trim())
            screeningUrl = row["booking_url"].trim();
        }
        if (!time) continue;
        if (filterDay && dayKey !== "any" && date && date !== dayKey) continue;
        // Drop screenings that already started: nobody can book a seat for a
        // film 40 minutes in, and listing them makes the board look wrong.
        if (isScreeningOver(time, date, dayKey)) continue;

        const key = `${film.cinema}|${normalize(venue)}`;
        const block =
          groups.get(key) ??
          ({
            key,
            cinema: film.cinema,
            venue,
            city: venueCity(film.cinema, venue) ?? film.city,
            distanceKm: venueDistance(film.cinema, venue, coords),
            bookingUrl: film.booking_url ?? film.source_url,
            screenings: [],
          } satisfies VenueBlock);
        if (!block.screenings.some((s) => s.time === time && s.format === format)) {
          block.screenings.push({
            time,
            minutes: timeToMinutes(time),
            format,
            bookingUrl: screeningUrl ?? block.bookingUrl,
          });
        }
        groups.set(key, block);
      }
    }

    return [...groups.values()].map((block) => ({
      ...block,
      screenings: [...block.screenings].sort((a, b) => a.minutes - b.minutes),
    }));
  };

  const result = build(true);
  const blocks = result.length > 0 ? result : build(false);
  return blocks.sort((a, b) => {
    const distanceGap = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    if (distanceGap !== 0) return distanceGap;
    return a.venue.localeCompare(b.venue);
  });
}

/**
 * A straight-line distance, rendered at the precision the input actually has.
 *
 * Two things this deliberately does not do.
 *
 * It does not say "away". The number is a great-circle distance and nobody
 * travels in a great circle. Deira to Burjuman is 2.0 km straight and a far
 * longer drive because the Creek is between them with few crossings; Dubai
 * Marina to Palm Jumeirah Mall is 3.8 km straight with exactly one road on and
 * off the Palm. "2.0 km away" is a claim about a journey we have never
 * measured, and two visitors reported the number not matching what they drove.
 *
 * It does not print metres to the metre. Venue coordinates are mall centroids,
 * accurate to a few hundred metres by their own definition in lib/venues, so
 * "805 m" asserts three digits of precision from data that has one. Rounding to
 * the nearest 100 m says what we know and stops there, and the leading ~ marks
 * it as an estimate at a glance.
 *
 * Real driving distance would need a routing call per venue per page load,
 * which this site cannot afford and does not need: the number exists to rank
 * cinemas against each other, and for ordering a straight line is exact.
 */
export function formatDistance(km: number | null): string | null {
  if (km === null) return null;
  // Round first, then choose the unit. Choosing the unit from the raw value
  // instead printed "~1000 m" for 0.96 km, because the rounding tipped it over
  // a kilometre after the branch had already been taken.
  //
  // Floored at 100 m: rounding below that gives "0 m", which reads as broken
  // rather than as very close.
  const metres = Math.max(100, Math.round(km * 10) * 100);
  if (metres < 1000) return `~${metres} m`;
  const rounded = metres / 1000;
  return rounded < 10 ? `~${rounded.toFixed(1)} km` : `~${Math.round(rounded)} km`;
}
