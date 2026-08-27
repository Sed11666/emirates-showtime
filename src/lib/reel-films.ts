/**
 * reel-films.ts — Reel Cinemas film ids, for deep links into their booking flow.
 *
 * Reel's site is a Vista front end that publishes its whole catalogue as plain,
 * unauthenticated JSON on Google Cloud Storage. An earlier investigation
 * concluded Reel could not be deep-linked because apiuae.reelcinemas.com
 * answers 401 — that was the wrong endpoint. These files need no key:
 *
 *   .../web/vista/json/Films.json     123 films, each with its HO… id
 *   .../web/vista/json/Sessions.json  every session, keyed by ScheduledFilmId
 *
 * With the id, their own URL builder (read out of their bundle) is:
 *
 *   generateMovieDetailUrl = (filmId, title, lang) =>
 *     `/${lang}/movie-details/${filmId}/${title}`
 *
 * That page carries the date picker, the venues and the Book Now buttons for
 * one film, which is as deep as anyone can link: their route table has no
 * per-session route, seat selection is in-app state. cinemaseats.net holds the
 * session ids and still falls back to this same page.
 */

const FILMS_URL =
  "https://storage.googleapis.com/eeg-prod-reelcinema-sb/web/vista/json/Films.json";
const SESSIONS_URL =
  "https://storage.googleapis.com/eeg-prod-reelcinema-sb/web/vista/json/Sessions.json";

const LANGUAGES =
  /\b(arabic|english|hindi|malayalam|tamil|telugu|kannada|urdu|japanese|korean|filipino|tagalog|russian|french|german|spanish|chinese)\b/i;

export type ReelFilm = { id: string; title: string; base: string; language: string | null };

/**
 * Reel's cinema ids against our venue names. Only the UAE screens: the same
 * feed carries Granada Mall and Marassi Bahrain, which are Reel branches we do
 * not list and must not start showing under a UAE city.
 */
const VENUE_BY_CINEMA_ID: Record<string, string> = {
  "0001": "Dubai Mall Cinema",
  "0002": "Marina Mall Cinema",
  "0006": "Springs Souk Cinema",
};

/**
 * Screen name to the format vocabulary the rest of the site already uses.
 *
 * Reel names the room, not the experience — "Platinum Suites 3", "Dolby Screen
 * 7", "Screen 4" — and Experience.json only lists which experiences a location
 * offers, not which room is which. The room name is the only per-session link
 * to an experience, so it is read here rather than joined.
 */
function screenFormat(screenName: string): string {
  const name = screenName.toLowerCase();
  if (name.includes("platinum")) return "Platinum Suites";
  if (name.includes("premium")) return "Premium";
  if (name.includes("dolby")) return "Dolby";
  if (name.includes("junior")) return "Reel Junior";
  if (name.includes("screenx")) return "ScreenX";
  if (name.includes("imax")) return "IMAX";
  return "Standard";
}

export type ReelScreening = { date: string; time: string; venue: string; format: string };

type RawSession = {
  ScheduledFilmId?: string;
  CinemaId?: string;
  Showtime?: string;
  ScreenName?: string;
  AllowTicketSales?: boolean;
};

/**
 * A title reduced to something comparable, plus the language it names.
 *
 * The two sources spell the same film differently: cinemauae writes
 * "Toxic - Tamil" where Reel writes "Toxic - A Fairy Tale For Grown Ups
 * (Tamil)", and "Minions & Monsters" against "Minions And Monsters". Language
 * is pulled out rather than discarded because it is what separates the three
 * Toxic entries, which are three different film ids.
 */
export function parseTitle(title: string): { base: string; language: string | null } {
  const language = LANGUAGES.exec(title)?.[1]?.toLowerCase() ?? null;
  const base = title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/\b(re-?release|rerelease)\b/g, " ")
    .replace(LANGUAGES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { base, language };
}

/** Levenshtein, bailing early — only ever used to ask "within two edits?". */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The Reel film matching a title, or null.
 *
 * Deliberately refuses rather than guesses. A wrong id sends someone to another
 * film's booking page, which is worse than the generic showtimes page we fall
 * back to, so every rule demands a single unambiguous candidate and languages
 * that do not contradict.
 */
export function matchReelFilm(title: string, candidates: ReelFilm[]): ReelFilm | null {
  const q = parseTitle(title);
  if (!q.base) return null;
  const langOk = (c: ReelFilm) => !q.language || !c.language || c.language === q.language;

  const exact = candidates.filter((c) => c.base === q.base && langOk(c));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  // One title being a prefix of the other: "Khalifa" against "Khalifa: The
  // Bloodline". Length-guarded so a short word cannot swallow a long title.
  const prefix = candidates.filter(
    (c) =>
      langOk(c) &&
      (c.base.startsWith(`${q.base} `) || q.base.startsWith(`${c.base} `)) &&
      Math.min(c.base.length, q.base.length) >= 5,
  );
  if (prefix.length === 1) return prefix[0]!;

  // Spelling drift: "Bethlahem"/"Bethlehem", "Philosopher"/"Philosopher's".
  // Long titles only, where two strings an edit apart are the same film.
  const near = candidates.filter(
    (c) => langOk(c) && q.base.length >= 12 && editDistance(c.base, q.base) <= 2,
  );
  return near.length === 1 ? near[0]! : null;
}

/** Reel's own slug rule, copied from their bundle so the URL matches theirs. */
export function reelSlug(title: string): string {
  return encodeURIComponent(
    title
      .toLowerCase()
      .replace(/&/g, "-and-")
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),
  );
}

export function reelMovieUrl(film: ReelFilm): string {
  return `https://reelcinemas.com/en-ae/movie-details/${film.id}/${reelSlug(film.title)}`;
}

/**
 * Films Reel is actually screening, indexed for matching.
 *
 * Restricted to films with sessions: the catalogue carries titles with nothing
 * scheduled, and linking to one is a page that says the film is not showing.
 * Returns [] on any failure, so a bad fetch costs the deep links for that run
 * and nothing else.
 */
export type ReelFeed = {
  films: ReelFilm[];
  /** Screenings for the requested days, by Reel film id. */
  screenings: Map<string, ReelScreening[]>;
};

/**
 * Reel's catalogue and schedule, restricted to the given Dubai day keys.
 *
 * Returns an empty feed on any failure. Callers must treat that as "no Reel
 * data this run" and leave what is already stored alone — a fetch that fails
 * must never be able to blank a chain's showtimes.
 */
export async function fetchReelFeed(dayKeys: string[]): Promise<ReelFeed> {
  const empty: ReelFeed = { films: [], screenings: new Map() };
  try {
    const [filmsRes, sessionsRes] = await Promise.all([fetch(FILMS_URL), fetch(SESSIONS_URL)]);
    if (!filmsRes.ok || !sessionsRes.ok) return empty;
    const filmsJson = (await filmsRes.json()) as { value?: Array<{ ID?: string; Title?: string }> };
    const sessionsJson = (await sessionsRes.json()) as { value?: RawSession[] };
    const sessions = sessionsJson.value ?? [];
    if (sessions.length === 0) return empty;

    const wanted = new Set(dayKeys);
    const screenings = new Map<string, ReelScreening[]>();
    for (const s of sessions) {
      const venue = VENUE_BY_CINEMA_ID[s.CinemaId ?? ""];
      // Showtime has no zone because Vista stores each cinema's local time, and
      // every one of these is Dubai. Slicing beats parsing: `new Date` on a
      // bare timestamp is read as UTC and would move late shows to the day before.
      const stamp = s.Showtime ?? "";
      const date = stamp.slice(0, 10);
      if (!venue || !s.ScheduledFilmId || !wanted.has(date)) continue;
      if (s.AllowTicketSales === false) continue;
      const list = screenings.get(s.ScheduledFilmId) ?? [];
      list.push({ date, time: stamp.slice(11, 16), venue, format: screenFormat(s.ScreenName ?? "") });
      screenings.set(s.ScheduledFilmId, list);
    }
    for (const list of screenings.values()) {
      list.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    }

    const showing = new Set(
      sessions.map((s) => s.ScheduledFilmId).filter(Boolean) as string[],
    );
    const films = (filmsJson.value ?? [])
      .filter((f) => f.ID && f.Title && showing.has(f.ID))
      .map((f) => ({ id: f.ID!, title: f.Title!.trim(), ...parseTitle(f.Title!) }));
    return { films, screenings };
  } catch {
    return empty;
  }
}
