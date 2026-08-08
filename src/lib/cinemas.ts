import { supabase } from "@/integrations/supabase/client";
import { parseDayKey } from "@/lib/days";

export type CinemaKey = "vox" | "reel" | "novo" | "roxy";

export const CINEMAS: { key: CinemaKey; label: string }[] = [
  { key: "vox", label: "VOX Cinemas" },
  { key: "reel", label: "Reel Cinemas" },
  { key: "novo", label: "Novo Cinemas" },
  { key: "roxy", label: "Roxy Cinemas" },
];

export const CINEMA_LABELS: Record<string, string> = Object.fromEntries(
  CINEMAS.map((c) => [c.key, c.label]),
);

export type CinemaFilm = {
  id: string;
  cinema: string;
  title: string;
  city: string | null;
  venues: string[];
  genre: string | null;
  language: string | null;
  rating: string | null;
  duration_mins: number | null;
  poster_url: string | null;
  synopsis: string | null;
  formats: string[];
  showtimes: unknown;
  booking_url: string | null;
  source_url: string | null;
  last_seen_at: string;
};

export async function fetchCinemaFilms(): Promise<CinemaFilm[]> {
  const { data, error } = await supabase
    .from("cinema_films")
    .select(
      "id, cinema, title, city, venues, genre, language, rating, duration_mins, poster_url, synopsis, formats, showtimes, booking_url, source_url, last_seen_at",
    )
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CinemaFilm[];
}

type ParsedShowtime = { date: string | null; text: string };

function parseShowtimes(value: unknown): ParsedShowtime[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): ParsedShowtime | null => {
      if (typeof entry === "string") return { date: null, text: entry };
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const parts = [row["venue"], row["date"], row["time"]].filter(Boolean);
        const text = parts.join(" · ");
        if (!text) return null;
        return { date: parseDayKey(row["date"]), text };
      }
      return null;
    })
    .filter((entry): entry is ParsedShowtime => Boolean(entry));
}

export function showtimeList(value: unknown): string[] {
  return parseShowtimes(value)
    .map((entry) => entry.text)
    .slice(0, 12);
}

/**
 * Showtimes for a given day key ("any" = no filter). Films whose showtimes carry
 * no date information keep their full schedule.
 */
export function showtimesForDay(value: unknown, dayKey: string): string[] {
  const parsed = parseShowtimes(value);
  if (dayKey === "any") return parsed.map((e) => e.text).slice(0, 12);
  // Undated entries always count; dated ones must match the selected day.
  const matching = parsed.filter((e) => !e.date || e.date === dayKey);
  if (matching.length > 0) return matching.map((e) => e.text).slice(0, 12);
  // Nothing for that day: fall back to the latest schedule we have.
  return parsed.map((e) => e.text).slice(0, 12);
}

export function hasDatedShowtimes(value: unknown): boolean {
  return parseShowtimes(value).some((e) => e.date);
}

export type VenueShowtimes = { venue: string; times: string[] };

/**
 * Showtimes grouped by venue for the "Today's showtimes" board: each venue
 * lists its own time chips for the selected day. Bare string times (Reel and
 * Roxy) are grouped under the film's known venue, and when nothing matches the
 * selected day we fall back to the latest schedule rather than showing nothing.
 */
export function showtimesByVenue(
  value: unknown,
  dayKey: string,
  fallbackVenue?: string,
): VenueShowtimes[] {
  if (!Array.isArray(value)) return [];

  const build = (filterDay: boolean): VenueShowtimes[] => {
    const groups = new Map<string, string[]>();
    for (const entry of value) {
      let time = "";
      let venue = fallbackVenue || "All screens";
      let date: string | null = null;

      if (typeof entry === "string") {
        time = entry.trim();
      } else if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        time = typeof row["time"] === "string" ? row["time"].trim() : "";
        date = parseDayKey(row["date"]);
        if (typeof row["venue"] === "string" && row["venue"].trim()) venue = row["venue"].trim();
      }
      if (!time) continue;
      if (filterDay && dayKey !== "any" && date && date !== dayKey) continue;

      const list = groups.get(venue) ?? [];
      if (!list.includes(time)) list.push(time);
      groups.set(venue, list);
    }
    return [...groups.entries()].map(([venue, times]) => ({ venue, times: times.slice(0, 8) }));
  };

  const filtered = build(true);
  const result = filtered.length > 0 ? filtered : build(false);
  return result.slice(0, 4);
}



/* ── Format + de-duplication ─────────────────────────────── */

const FORMAT_PATTERNS: Array<[RegExp, string]> = [
  [/imax/i, "IMAX"],
  [/4\s*dx/i, "4DX"],
  [/\b3\s*d\b/i, "3D"],
  [/\b2\s*d\b/i, "2D"],
  [/max|dolby|atmos/i, "MAX"],
  [/gold|theatre|platinum|vip|7\s*star/i, "PREMIUM"],
];

const FORMAT_ORDER = ["IMAX", "4DX", "MAX", "PREMIUM", "3D", "2D"];

/** Canonical screen formats for a film, derived from formats + showtimes. */
export function filmFormats(film: CinemaFilm): string[] {
  const raw: string[] = [...(film.formats ?? [])];
  if (Array.isArray(film.showtimes)) {
    for (const entry of film.showtimes) {
      if (entry && typeof entry === "object") {
        const value = (entry as Record<string, unknown>)["format"];
        if (typeof value === "string") raw.push(value);
      }
    }
  }
  const found = new Set<string>();
  for (const value of raw) {
    for (const [pattern, label] of FORMAT_PATTERNS) {
      if (pattern.test(value)) found.add(label);
    }
  }
  if (found.size === 0) found.add("2D");
  return FORMAT_ORDER.filter((f) => found.has(f));
}

export function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type MergedFilm = CinemaFilm & { cinemas: string[]; screenFormats: string[] };

/**
 * One card per movie: the same title playing at VOX, Reel, Novo and Roxy is
 * collapsed into a single entry carrying every chain and screen format.
 */
export function mergeFilmsByTitle(films: CinemaFilm[]): MergedFilm[] {
  const map = new Map<string, MergedFilm>();
  for (const film of films) {
    const key = titleKey(film.title);
    const existing = map.get(key);
    const formats = filmFormats(film);
    if (!existing) {
      map.set(key, { ...film, cinemas: [film.cinema], screenFormats: formats });
      continue;
    }
    existing.cinemas = [...new Set([...existing.cinemas, film.cinema])];
    existing.screenFormats = FORMAT_ORDER.filter((f) =>
      new Set([...existing.screenFormats, ...formats]).has(f),
    );
    existing.venues = [...new Set([...existing.venues, ...film.venues])];
    if (!existing.poster_url && film.poster_url) existing.poster_url = film.poster_url;
    if (!existing.synopsis && film.synopsis) existing.synopsis = film.synopsis;
    if (!existing.rating && film.rating) existing.rating = film.rating;
    if (!existing.duration_mins && film.duration_mins) existing.duration_mins = film.duration_mins;
    if (!existing.genre && film.genre) existing.genre = film.genre;
    if (!existing.language && film.language) existing.language = film.language;
    if (Array.isArray(film.showtimes) && Array.isArray(existing.showtimes)) {
      existing.showtimes = [...existing.showtimes, ...film.showtimes];
    } else if (!existing.showtimes) {
      existing.showtimes = film.showtimes;
    }
  }
  return [...map.values()];
}
