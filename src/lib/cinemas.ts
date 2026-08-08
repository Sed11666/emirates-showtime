import { supabase } from "@/integrations/supabase/client";

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
  const dated = parsed.filter((e) => e.date);
  if (dated.length === 0) return parsed.map((e) => e.text).slice(0, 12);
  return dated.filter((e) => e.date === dayKey).map((e) => e.text).slice(0, 12);
}

export function hasDatedShowtimes(value: unknown): boolean {
  return parseShowtimes(value).some((e) => e.date);
}

