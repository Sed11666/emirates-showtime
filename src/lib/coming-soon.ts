/**
 * coming-soon.ts — upcoming UAE releases, parsed from cinemauae's own
 * coming-soon index.
 *
 * Deliberately not in the database. Every other scraped thing here is stored
 * because it changes hourly and is read on every page; this is one 11KB page of
 * release dates that move a few times a month. Storing it would mean a table, a
 * SECURITY DEFINER writer and a cron job to keep a list that a single fetch
 * answers, so the server route caches it in memory instead.
 *
 * Same parsing rules as the showtime scraper: plain regex over server-rendered
 * markup, no LLM extraction, and nothing here is allowed to link back to
 * cinemauae — see filmSlug below.
 */

export type ComingSoonFilm = {
  /** Our own slug, derived from the title — never cinemauae's URL. */
  slug: string;
  title: string;
  /** Raw as published, e.g. "17 Dec 2026". Kept verbatim for display. */
  releaseDate: string | null;
  /** Sortable form of releaseDate, or null when it could not be parsed. */
  releaseDayKey: string | null;
  /** Every language this title is released in, merged across its variants. */
  languages: string[];
  posterUrl: string | null;
  /** Their poster filenames are IMDb ids, which is a stable cross-source key. */
  imdbId: string | null;
};

const CARD_RX =
  /<a href="\/movie\/([a-z0-9-]+)" class="movie-card[^"]*">([\s\S]*?)<\/a>/g;
const TITLE_RX = /<h3 class="movie-card-title">([^<]+)<\/h3>/;
const POSTER_RX = /<img[^>]*class="poster[^"]*"[^>]*src="([^"]+)"/;
const META_RX = /<span class="movie-meta-label">([^<]+)<\/span>\s*([^<]*)</g;
const IMDB_RX = /\/(tt\d+)\.[a-z]+$/i;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * "17 Dec 2026" → "2026-12-17". Returns null rather than guessing: an unsorted
 * entry at the end of the list is better than one placed on a wrong date.
 */
export function releaseDayKey(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2]!.toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1]!.padStart(2, "0")}`;
}

/**
 * "Toxic - Hindi" → "Toxic". Only strips a trailing " - Word", so a title that
 * genuinely ends in a dashed word survives unless it is a known language.
 */
const LANGUAGE_SUFFIXES = new Set([
  "hindi", "tamil", "telugu", "malayalam", "kannada", "arabic", "english",
  "urdu", "punjabi", "bengali", "marathi", "tagalog", "russian", "french",
]);

export function stripLanguageSuffix(title: string): string {
  const match = /^(.*?)\s+-\s+([A-Za-z]+)$/.exec(title.trim());
  if (!match) return title.trim();
  return LANGUAGE_SUFFIXES.has(match[2]!.toLowerCase()) ? match[1]!.trim() : title.trim();
}

/** Title → slug, matching how the rest of the site builds film slugs. */
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseComingSoon(html: string): ComingSoonFilm[] {
  const out: ComingSoonFilm[] = [];
  const seen = new Set<string>();

  for (const card of html.matchAll(CARD_RX)) {
    const body = card[2] ?? "";
    const title = decodeEntities((TITLE_RX.exec(body)?.[1] ?? "").trim());
    if (!title) continue;

    const slug = toSlug(title);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    let releaseDate: string | null = null;
    let language: string | null = null;
    for (const meta of body.matchAll(META_RX)) {
      const label = (meta[1] ?? "").toLowerCase();
      const value = decodeEntities((meta[2] ?? "").trim());
      if (!value) continue;
      if (label.startsWith("release")) releaseDate = value;
      else if (label.startsWith("language")) language = value;
    }

    const posterUrl = POSTER_RX.exec(body)?.[1] ?? null;

    out.push({
      slug,
      title,
      releaseDate,
      releaseDayKey: releaseDayKey(releaseDate),
      languages: language ? [language] : [],
      posterUrl,
      imdbId: posterUrl ? (IMDB_RX.exec(posterUrl)?.[1] ?? null) : null,
    });
  }

  // One card per film, per the site-wide rule. cinemauae lists a dubbed title
  // once per language — Toxic appears as Hindi, Kannada, Malayalam and Tamil,
  // all sharing one IMDb id — and four identical posters in a row reads as a
  // bug. Merge on imdb_id, which is the reliable key here: the titles differ by
  // a suffix that titleKey() does not strip, since it uses " - Lang" rather
  // than the bracketed form.
  const merged = new Map<string, ComingSoonFilm>();
  for (const film of out) {
    const key = film.imdbId ?? film.slug;
    const existing = merged.get(key);
    if (!existing) {
      // Drop the language suffix so the card reads "Toxic", not "Toxic - Hindi".
      merged.set(key, { ...film, title: stripLanguageSuffix(film.title) });
      continue;
    }
    for (const lang of film.languages) {
      if (!existing.languages.includes(lang)) existing.languages.push(lang);
    }
    // Keep the earliest announced date if the variants disagree.
    if (
      film.releaseDayKey &&
      (!existing.releaseDayKey || film.releaseDayKey < existing.releaseDayKey)
    ) {
      existing.releaseDayKey = film.releaseDayKey;
      existing.releaseDate = film.releaseDate;
    }
  }

  // Soonest first; anything undated sorts last rather than pretending to a date.
  return [...merged.values()].sort((a, b) => {
    if (a.releaseDayKey && b.releaseDayKey) return a.releaseDayKey.localeCompare(b.releaseDayKey);
    if (a.releaseDayKey) return -1;
    if (b.releaseDayKey) return 1;
    return a.title.localeCompare(b.title);
  });
}
