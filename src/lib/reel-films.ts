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
export async function fetchReelFilms(): Promise<ReelFilm[]> {
  try {
    const [filmsRes, sessionsRes] = await Promise.all([fetch(FILMS_URL), fetch(SESSIONS_URL)]);
    if (!filmsRes.ok || !sessionsRes.ok) return [];
    const films = (await filmsRes.json()) as { value?: Array<{ ID?: string; Title?: string }> };
    const sessions = (await sessionsRes.json()) as {
      value?: Array<{ ScheduledFilmId?: string }>;
    };
    const showing = new Set(
      (sessions.value ?? []).map((s) => s.ScheduledFilmId).filter(Boolean) as string[],
    );
    return (films.value ?? [])
      .filter((f) => f.ID && f.Title && showing.has(f.ID))
      .map((f) => ({ id: f.ID!, title: f.Title!.trim(), ...parseTitle(f.Title!) }));
  } catch {
    return [];
  }
}
