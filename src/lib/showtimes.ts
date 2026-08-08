import { parseDayKey } from "@/lib/days";
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

/** "7:45pm", "07:45 PM" and "19:45" all become minutes past midnight. */
export function timeToMinutes(raw: string): number {
  const match = raw.trim().match(/^(\d{1,2})[:.](\d{2})\s*([ap]\.?m\.?)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  if (suffix?.startsWith("p") && hours < 12) hours += 12;
  if (suffix?.startsWith("a") && hours === 12) hours = 0;
  // Past-midnight screenings belong at the end of the evening.
  if (hours < 5) hours += 24;
  return hours * 60 + minutes;
}

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

export function formatDistance(km: number | null): string | null {
  if (km === null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}
