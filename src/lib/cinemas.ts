/**
 * cinemas.ts — Cinema film data layer (READ side of the scraper pipeline).
 *
 * Source of truth: the `cinema_films` table, populated by the Firecrawl
 * scraper at src/routes/api/public/hooks/scrape-cinemas.ts.
 *
 * Responsibilities:
 *  - CINEMAS / CINEMA_LABELS: the four supported UAE chains (vox, reel, novo, roxy).
 *  - fetchCinemaFilms(): pulls active films from Lovable Cloud (Supabase).
 *  - showtimeList / showtimesForDay / showtimesByVenue: normalise the loosely
 *    typed `showtimes` JSONB column into usable shapes, all in Asia/Dubai time.
 *  - mergeFilmsByTitle(): de-duplicates the same movie across chains so the
 *    homepage shows one card per title (formats such as IMAX/4DX are merged in).
 *  - filmSlug()/titleKey(): stable identifiers used by the /movie/$slug route.
 *
 * Consumed by: routes/index.tsx, routes/cinemas.tsx, routes/movie.$slug.tsx,
 * lib/showtimes.ts, lib/search.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { isScreeningOver, parseDayKey, timeToMinutes, toDayKey } from "@/lib/days";

export type CinemaKey =
  | "vox"
  | "reel"
  | "novo"
  | "roxy"
  | "star"
  | "cineroyal"
  | "cinemacity";

/**
 * Drives the chain filter and every human-readable chain name. A chain the
 * scraper can produce but that is missing here is invisible in the filter even
 * though its films are listed, so keep this in step with CHAIN_KEYS in
 * scrape-aggregator.ts.
 */
export const CINEMAS: { key: CinemaKey; label: string }[] = [
  { key: "vox", label: "VOX Cinemas" },
  { key: "star", label: "Star Cinemas" },
  { key: "novo", label: "Novo Cinemas" },
  { key: "roxy", label: "Roxy Cinemas" },
  { key: "cinemacity", label: "Cinema City" },
  { key: "cineroyal", label: "Cine Royal" },
  { key: "reel", label: "Reel Cinemas" },
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
  director: string | null;
  /** Billed leads only — the scraper keeps the first four. */
  cast_names: string[] | null;
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
      "id, cinema, title, city, venues, genre, language, rating, duration_mins, poster_url, synopsis, director, cast_names, formats, showtimes, booking_url, source_url, last_seen_at",
    )
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CinemaFilm[];
}

/**
 * The same films, trimmed to one day and to what a browse card renders.
 *
 * This exists for the route loader, which runs on the server: the full set is
 * ~1.5MB of JSON, and a loader's return value is serialised into the HTML, so
 * shipping all of it would trade a crawlable page for a slow one — and Core Web
 * Vitals is itself a ranking signal. The heavy read stays server-to-Supabase;
 * only the trimmed result crosses the wire.
 *
 * Synopsis is dropped because no card on /cinemas renders it. The client's own
 * query fetches the complete set straight after hydration, so switching days or
 * scoping to a film has everything by the time anyone can click.
 */
export async function fetchCinemaFilmsForDay(dayKey: string): Promise<CinemaFilm[]> {
  const { data, error } = await supabase
    .from("cinema_films")
    .select(
      "id, cinema, title, city, venues, genre, language, rating, duration_mins, poster_url, formats, showtimes, booking_url, source_url, last_seen_at",
    )
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const film = row as CinemaFilm;
    const times = Array.isArray(film.showtimes) ? film.showtimes : [];
    return {
      ...film,
      showtimes: times.filter((entry) => {
        if (!entry || typeof entry !== "object") return true;
        const date = (entry as Record<string, unknown>)["date"];
        return typeof date !== "string" || date === dayKey;
      }),
    };
  }) as CinemaFilm[];
}

/**
 * One chain's films for one day, for the chain landing page's loader.
 *
 * Filtered in SQL on cinema, so unlike the film-page loader this reads only
 * what it needs. Showtimes are narrowed to the day here rather than in the
 * component so the payload serialised into the HTML stays small.
 */
export async function fetchChainFilms(chain: string, dayKey: string): Promise<CinemaFilm[]> {
  const { data, error } = await supabase
    .from("cinema_films")
    .select(
      "id, cinema, title, city, venues, genre, language, rating, duration_mins, poster_url, formats, showtimes, booking_url, source_url, last_seen_at",
    )
    .eq("is_active", true)
    .eq("cinema", chain)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as CinemaFilm[]).map((film) => {
    const times = Array.isArray(film.showtimes) ? film.showtimes : [];
    return {
      ...film,
      showtimes: times.filter((entry) => {
        if (!entry || typeof entry !== "object") return true;
        const date = (entry as Record<string, unknown>)["date"];
        return typeof date !== "string" || date === dayKey;
      }),
    };
  });
}

/**
 * One emirate's films for one day, for the city landing page's loader.
 *
 * cinema_films carries a city per row, so this filters in SQL and reads only
 * what it needs. Showtimes are narrowed to the day here so the payload
 * serialised into the HTML stays small.
 */
export async function fetchCityFilms(city: string, dayKey: string): Promise<CinemaFilm[]> {
  const { data, error } = await supabase
    .from("cinema_films")
    .select(
      "id, cinema, title, city, venues, genre, language, rating, duration_mins, poster_url, formats, showtimes, booking_url, source_url, last_seen_at",
    )
    .eq("is_active", true)
    .eq("city", city)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as CinemaFilm[]).map((film) => {
    const times = Array.isArray(film.showtimes) ? film.showtimes : [];
    return {
      ...film,
      showtimes: times.filter((entry) => {
        if (!entry || typeof entry !== "object") return true;
        const date = (entry as Record<string, unknown>)["date"];
        return typeof date !== "string" || date === dayKey;
      }),
    };
  });
}

/**
 * Every chain's copy of one film, for the film page's loader.
 *
 * Filtering happens here rather than in SQL because the slug is derived from
 * the title through titleKey(), which Postgres has no equivalent of. The scan
 * is server-side and the payload that reaches the browser is one film's rows —
 * a few KB — instead of the whole catalogue.
 *
 * All three days, unlike the browse loader: this page is where someone picks a
 * screening, so it needs the full schedule rather than just today's.
 */
export async function fetchFilmBySlug(slug: string): Promise<CinemaFilm[]> {
  const { data, error } = await supabase
    .from("cinema_films")
    .select(
      "id, cinema, title, city, venues, genre, language, rating, duration_mins, poster_url, synopsis, director, cast_names, formats, showtimes, booking_url, source_url, last_seen_at",
    )
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CinemaFilm[]).filter((film) => filmSlug(film.title) === slug);
}

/**
 * `text` is for display and reads "Venue · date · time". `time` is the bare
 * clock value — keep them apart: anything doing time arithmetic needs `time`,
 * and passing `text` to a parser silently yields "unparseable", which reads as
 * "not finished yet" and quietly disables whatever filter depends on it.
 */
type ParsedShowtime = { date: string | null; time: string; venue: string; text: string };

function parseShowtimes(value: unknown): ParsedShowtime[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): ParsedShowtime | null => {
      if (typeof entry === "string") return { date: null, time: entry, venue: "", text: entry };
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const parts = [row["venue"], row["date"], row["time"]].filter(Boolean);
        const text = parts.join(" · ");
        if (!text) return null;
        const time = typeof row["time"] === "string" ? row["time"].trim() : "";
        const venue = typeof row["venue"] === "string" ? row["venue"].trim() : "";
        return { date: parseDayKey(row["date"]), time, venue, text };
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
  // Screenings that already started are dropped first, so a film whose last
  // show has begun stops counting as "playing today" for the day filter.
  const parsed = parseShowtimes(value).filter(
    (e) => !isScreeningOver(e.time, e.date ?? null, dayKey),
  );
  if (dayKey === "any") return parsed.map((e) => e.text).slice(0, 12);
  // Undated entries always count; dated ones must match the selected day.
  //
  // No fallback. This used to return "the latest schedule we have" when a day
  // had no matches, which meant picking a day we held no data for rendered
  // today's times under that date — including ones already past. Now that the
  // scraper reads three real days, an empty result means that film genuinely
  // has nothing on that day, and saying so is the whole point.
  return parsed
    .filter((e) => !e.date || e.date === dayKey)
    .map((e) => e.text)
    .slice(0, 12);
}

export function hasDatedShowtimes(value: unknown): boolean {
  return parseShowtimes(value).some((e) => e.date);
}

/**
 * True when at least one screening has not started yet.
 *
 * A film whose last showing began an hour ago is not "now showing" — there is
 * nothing left to book — so it should not occupy a card or a search result.
 * Uses the same isScreeningOver rule as the showtime chips, so a title
 * disappears from the home page at the moment its final time drops off the
 * Cinemas board rather than at some other threshold.
 */
export function hasUpcomingScreenings(value: unknown, now: Date = new Date()): boolean {
  const today = toDayKey(now);
  return parseShowtimes(value).some((e) => !isScreeningOver(e.time, e.date ?? null, today, now));
}

/**
 * One screening chip: clock time, the screen type it plays on, and the deep
 * link to that exact screening on the chain's own site where we have one.
 */
export type VenueScreening = { time: string; format: string | null; bookingUrl: string | null };
export type VenueShowtimes = {
  venue: string;
  times: VenueScreening[];
  /** Times this venue has that were trimmed away. 0 when nothing was hidden. */
  hiddenTimes: number;
};

/**
 * A trimmed board plus what the trimming cost, so the UI can say so.
 *
 * The browse list caps each film at a few venues and times — 35 films across 50
 * screens would otherwise be thousands of rows on a phone. That cap used to be
 * silent, which is worse than the trimming itself: a visitor comparing us with
 * the source saw four venues where they knew there were fifty, with nothing to
 * suggest the rest existed one click away.
 */
export type TrimmedShowtimes = {
  venues: VenueShowtimes[];
  /** Venues not shown at all. 0 when nothing was hidden. */
  hiddenVenues: number;
  totalVenues: number;
};

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
  /**
   * Trimming is opt-in and belongs to the caller. This used to cap at 4 venues
   * and 8 times unconditionally, which was invisible at the call site: a film
   * playing 36 screens rendered 4, and changing the chain filter only changed
   * which 4 survived. A browse list may still want to trim; a page showing one
   * film must not.
   */
  options?: { maxVenues?: number; maxTimesPerVenue?: number },
): TrimmedShowtimes {
  if (!Array.isArray(value)) return { venues: [], hiddenVenues: 0, totalVenues: 0 };
  const maxVenues = options?.maxVenues ?? Infinity;
  const maxTimes = options?.maxTimesPerVenue ?? Infinity;

  const build = (filterDay: boolean): VenueShowtimes[] => {
    const groups = new Map<string, VenueScreening[]>();
    for (const entry of value) {
      let time = "";
      let venue = fallbackVenue || "All screens";
      let date: string | null = null;
      let format: string | null = null;
      let bookingUrl: string | null = null;

      if (typeof entry === "string") {
        time = entry.trim();
      } else if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        time = typeof row["time"] === "string" ? row["time"].trim() : "";
        date = parseDayKey(row["date"]);
        if (typeof row["venue"] === "string" && row["venue"].trim()) venue = row["venue"].trim();
        if (typeof row["format"] === "string" && row["format"].trim())
          format = row["format"].trim();
        if (typeof row["booking_url"] === "string" && row["booking_url"].startsWith("http"))
          bookingUrl = row["booking_url"];
      }
      if (!time) continue;
      if (filterDay && dayKey !== "any" && date && date !== dayKey) continue;
      if (isScreeningOver(time, date, dayKey)) continue;

      const list = groups.get(venue) ?? [];
      // The same clock time can legitimately run twice at one venue on
      // different screens (19:00 Standard and 19:00 Gold), so the identity of a
      // chip is time + format, not time alone.
      const seen = list.find((s) => s.time === time && s.format === format);
      if (!seen) {
        list.push({ time, format, bookingUrl });
      } else if (!seen.bookingUrl && bookingUrl) {
        // Same screening scraped twice, once without a link: keep the link.
        seen.bookingUrl = bookingUrl;
      }
      groups.set(venue, list);
    }
    return [...groups.entries()].map(([venue, times]) => {
      // Chronological within the calendar day, which is how the source dates
      // these: a 00:20 show is that day's first chip, not the previous night's
      // last. `times` is already filtered to one day, so plain minutes suffice.
      const ordered = [...times].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      const shown = Number.isFinite(maxTimes) ? ordered.slice(0, maxTimes) : ordered;
      return { venue, times: shown, hiddenTimes: ordered.length - shown.length };
    });
  };

  // Always day-filtered. This used to fall back to an unfiltered build when a
  // day had no chips, which put another day's times under the selected date —
  // the same fault showtimesForDay had. With three real days scraped, a film
  // with nothing on the chosen day should render nothing for that day.
  const all = build(true);
  const venues = Number.isFinite(maxVenues) ? all.slice(0, maxVenues) : all;
  return { venues, hiddenVenues: all.length - venues.length, totalVenues: all.length };
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

/** Language/label suffixes that decorate the same film across chains. */
const TITLE_SUFFIX =
  /\s*[([]\s*(arabic|english|hindi|malayalam|tamil|telugu|kannada|urdu|filipino|tagalog|russian|french|german|spanish|chinese|korean|japanese|dubbed|subtitled|sub(?:titles)?|live[\s-]?action|re[\s-]?release|imax|4dx|3d|2d|roxy ladies|ladies(?: night)?|kids|gold|premium)\b[^)\]]*[)\]]\s*$/i;

/** Must stay in sync with titleKey() in the cinema scraper. */
export function titleKey(title: string) {
  let value = title.trim();
  for (let i = 0; i < 3 && TITLE_SUFFIX.test(value); i += 1) {
    value = value.replace(TITLE_SUFFIX, "").trim();
  }
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** URL-safe id for a film title, e.g. "Toy Story 5" → "toy-story-5". */
export function filmSlug(title: string) {
  return titleKey(title).replace(/\s+/g, "-") || "film";
}


export type MergedFilm = CinemaFilm & { cinemas: string[]; screenFormats: string[] };

/**
 * One card per movie: the same title playing at VOX, Reel, Novo and Roxy is
 * collapsed into a single entry carrying every chain and screen format.
 */
/**
 * What "trending" means here: how much screen capacity UAE exhibitors are
 * giving a film **right now**. We have no ticket sales and no ratings feed, so
 * the schedule itself is the honest signal — it is the chains' own revealed
 * judgement of demand, and they revise it weekly.
 *
 * Three components, each normalised against the strongest film in the same
 * catalogue so they are comparable rather than competing on raw magnitude:
 *
 *  - `screenings` — how many showings still to come today. The clearest signal:
 *    a blockbuster gets hundreds a day, a limited release gets a handful.
 *  - `venues` — how many distinct screens carry it, so one megaplex stacking a
 *    film every 20 minutes cannot outrank a film playing across the country.
 *  - `chains` — how many of the chains carry it, so a single chain's exclusive
 *    does not top a national board. This one saturates (the big titles are on
 *    every chain), which is intended: it separates the broad from the niche and
 *    then lets capacity decide among the leaders.
 *
 * Deliberately scored on **today only**, for two reasons. It is what "trending"
 * means, and it is the only window both renders agree on: the home loader ships
 * today's showtimes (see fetchCinemaFilmsForDay) while the client query fetches
 * three days, so a score counting every day would rank one way in the HTML and
 * another after hydration, visibly reshuffling the hero and the first cards.
 *
 * Weights are a judgement call, so they are named and tunable rather than
 * hidden in an expression. The previous version used bare magic numbers
 * (chains * 100 + venues * 10 + screenings) which read as a priority order but
 * was not one: screening counts reach the thousands, so that term swamped the
 * other two and the multipliers bought nothing.
 */
const TRENDING_WEIGHTS = { screenings: 0.4, venues: 0.3, chains: 0.3 };

export type TrendingSignals = { chains: number; venues: number; screenings: number };

/**
 * Which day to score, and from when.
 *
 * `dayKey` must be the day the surface is actually rendering — /cinemas has a
 * date picker, so scoring today's schedule under a "Tomorrow" heading would
 * rank the board by screenings the visitor cannot see. "any" scores every
 * upcoming screening we hold. Pages that only ever show today can omit it.
 */
export type TrendingOptions = { dayKey?: string; now?: Date };

/** The raw counts behind a film's trending score, for display and debugging. */
export function trendingSignals(film: MergedFilm, options: TrendingOptions = {}): TrendingSignals {
  const now = options.now ?? new Date();
  const today = toDayKey(now);
  const dayKey = options.dayKey ?? today;
  // isScreeningOver needs a concrete day to judge undated entries against;
  // "any" has none, so fall back to today exactly as the chip filters do.
  const against = dayKey === "any" ? today : dayKey;
  const upcoming = parseShowtimes(film.showtimes).filter((e) => {
    if (isScreeningOver(e.time, e.date ?? null, against, now)) return false;
    return dayKey === "any" || !e.date || e.date === dayKey;
  });
  return {
    chains: film.cinemas.length,
    venues: new Set(upcoming.map((e) => e.venue).filter(Boolean)).size,
    screenings: upcoming.length,
  };
}

/**
 * Films ordered most-trending first. Pure — returns a new array.
 *
 * Ties break on raw screenings, then venues, then title, so the order is fully
 * determined by the data: an unstable sort here would let the hero and the grid
 * disagree about which film is second.
 */
export function rankByTrending<T extends MergedFilm>(
  films: T[],
  options: TrendingOptions = {},
): T[] {
  const signals = new Map<string, TrendingSignals>();
  for (const film of films) signals.set(film.id, trendingSignals(film, options));

  // Normalise against the best in this set. Floors of 1 keep an empty or
  // single-film catalogue from dividing by zero.
  const peak = { chains: 1, venues: 1, screenings: 1 };
  for (const s of signals.values()) {
    peak.chains = Math.max(peak.chains, s.chains);
    peak.venues = Math.max(peak.venues, s.venues);
    peak.screenings = Math.max(peak.screenings, s.screenings);
  }

  const score = (film: T) => {
    const s = signals.get(film.id) ?? { chains: 0, venues: 0, screenings: 0 };
    return (
      TRENDING_WEIGHTS.chains * (s.chains / peak.chains) +
      TRENDING_WEIGHTS.venues * (s.venues / peak.venues) +
      TRENDING_WEIGHTS.screenings * (s.screenings / peak.screenings)
    );
  };

  return [...films].sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    const sa = signals.get(a.id) ?? { chains: 0, venues: 0, screenings: 0 };
    const sb = signals.get(b.id) ?? { chains: 0, venues: 0, screenings: 0 };
    if (sb.screenings !== sa.screenings) return sb.screenings - sa.screenings;
    if (sb.venues !== sa.venues) return sb.venues - sa.venues;
    return a.title.localeCompare(b.title);
  });
}

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
    if (!existing.director && film.director) existing.director = film.director;
    if (!existing.cast_names?.length && film.cast_names?.length)
      existing.cast_names = film.cast_names;
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
