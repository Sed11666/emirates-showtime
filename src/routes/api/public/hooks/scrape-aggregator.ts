/**
 * GET/POST /api/public/hooks/scrape-aggregator — coverage + deep-link scraper.
 *
 * Source: cinemauae.com, a UAE showtime aggregator. Compared with the direct
 * Firecrawl chain scraper in scrape-cinemas.ts it wins on every axis measured:
 * eight chains vs four, 52+ venues vs 21, all eight emirates, 127 films — and
 * a real per-screening booking link on 100% of still-bookable screenings,
 * including Reel, Novo and Roxy, which the chains' own sites do not expose.
 *
 * TIMING MATTERS. Their time chips carry a booking href only while the show is
 * still bookable; once it starts, the chip becomes a plain disabled <span>
 * with no link. So a 05:00 Dubai run captures nearly a full day of links and a
 * midnight run captures almost none. That is also why upserts here MERGE
 * booking links rather than replacing the array wholesale — a later run must
 * never strip a link an earlier run legitimately captured.
 *
 * No Firecrawl, no Playwright, no API key: the pages are server-rendered, so a
 * plain fetch sees the whole showtime table. This route therefore keeps
 * working regardless of the Firecrawl/Lovable connector.
 *
 * Politeness: sequential fetches with a delay, a real UA, and a wall-clock
 * budget. Their robots.txt allows `/`; we read only public listing pages.
 *
 * Partial runs are expected (see BUDGET_MS) and MUST NOT deactivate anything:
 * a film we simply did not reach is not a film that stopped showing. Only a
 * run that walked the entire sitemap may retire rows, and never more than 30%
 * of a chain at once.
 */
import { createFileRoute } from "@tanstack/react-router";

import { fetchReelFeed, matchReelFilm, reelMovieUrl, type ReelFeed } from "@/lib/reel-films";

const ORIGIN = "https://cinemauae.com";
const SITEMAP = `${ORIGIN}/sitemap.xml`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

/** Their badge label -> our `cinema` key. */
const CHAIN_KEYS: Record<string, string> = {
  VOX: "vox",
  REEL: "reel",
  NOVO: "novo",
  ROXY: "roxy",
  STAR: "star",
  CINEROYAL: "cineroyal",
  "CINE ROYAL": "cineroyal",
  CINEMACITY: "cinemacity",
  "CINEMA CITY": "cinemacity",
  CINEPOLIS: "cinepolis",
  GALAXY: "galaxy",
};

/**
 * Chain-level fallback link. The UI resolves a booking target as
 * `film.booking_url ?? film.source_url` (see lib/showtimes.ts), so BOTH of
 * those must point at the chain — never at the aggregator we sourced from, or
 * every showtime without its own per-screening link sends our users to a
 * competitor's page.
 */
const CHAIN_HOME: Record<string, string> = {
  vox: "https://uae.voxcinemas.com/",
  // Reel's showtimes chooser rather than its marketing homepage. cinemauae
  // publishes booklink=0 for every Reel chip — the only chain it does that for
  // — so this fallback is what every Reel screening actually opens, and landing
  // on "pick a cinema and a time" beats landing on a hero banner.
  //
  // Only the last resort now. This comment used to say a film's own page was
  // unreachable because the id needed their React app or an API that 401s —
  // that was wrong, and wrong in the expensive direction: it sat here long
  // enough to be treated as settled. Reel publishes Films.json and
  // Sessions.json as plain unauthenticated JSON (see lib/reel-films), so a
  // matched film gets /movie-details/{id}/{slug} and this is used only when the
  // title cannot be matched with confidence.
  reel: "https://reelcinemas.com/en-ae/showtime",
  novo: "https://uae.novocinemas.com/",
  roxy: "https://www.theroxycinemas.com/",
  star: "https://www.starcinemas.ae/",
  cineroyal: "https://cineroyal.ae/",
  cinemacity: "https://booking.cinemacity.ae/",
  cinepolis: "https://cinepolisgulf.com/",
  galaxy: "https://galaxycinemas.ae/",
};

const CITY_NAMES: Record<string, string> = {
  dubai: "Dubai",
  "abu-dhabi": "Abu Dhabi",
  sharjah: "Sharjah",
  ajman: "Ajman",
  fujairah: "Fujairah",
  "ras-al-khaimah": "Ras Al Khaimah",
  "umm-al-quwain": "Umm Al Quwain",
  "al-ain": "Al Ain",
};

/** Leave headroom under the pg_cron caller's 120s HTTP timeout. */
const BUDGET_MS = 45_000;
const PAGE_DELAY_MS = 900;

/**
 * How many days ahead to read. cinemauae serves today, tomorrow and the day
 * after behind ?d=0|1|2; ?d=3 falls back to d=0, so three is their ceiling,
 * not a choice of ours.
 */
const SCRAPE_DAYS = 3;

/**
 * Self-pacing. PAGES_PER_RUN must stay at or under the pages a run actually
 * completes — measured at 12 with three days per page — and PACE_WINDOW_MS must
 * match the cron interval, currently every 15 minutes. A full pass is
 * ceil(sitemap / PAGES_PER_RUN) fires, about four hours at these numbers.
 */
const PAGES_PER_RUN = 10;
const PACE_WINDOW_MS = 15 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Dubai day N days from now. Safe as plain millisecond arithmetic because
 * Dubai is UTC+4 all year and never observes DST.
 */
function dubaiDayPlus(days: number) {
  return dubaiDayOf(new Date(Date.now() + days * 86_400_000));
}

function dubaiDayOf(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dubaiToday() {
  return dubaiDayOf(new Date());
}

/** Must stay in sync with scrape-cinemas.ts and lib/cinemas.ts. */
const TITLE_SUFFIX =
  /\s*[([]\s*(arabic|english|hindi|malayalam|tamil|telugu|kannada|urdu|filipino|tagalog|russian|french|german|spanish|chinese|korean|japanese|dubbed|subtitled|sub(?:titles)?|live[\s-]?action|re[\s-]?release|imax|4dx|3d|2d|roxy ladies|ladies(?: night)?|kids|gold|premium)\b[^)\]]*[)\]]\s*$/i;

function titleKey(title: string) {
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

/** "09:00 AM" / "7:45pm" / "19:45" -> "HH:MM", else null. */
function normalizeTime(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\s*[:.]\s*(\d{2})\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const suffix = m[3]?.[0];
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;
  if (suffix === "p" && hours < 12) hours += 12;
  if (suffix === "a" && hours === 12) hours = 0;
  if (hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Screen types arrive however each chain happens to type them, so GOLD and
 * Gold were two values for one product — fine while we only ever shout them in
 * a pill, wrong the moment anything groups or filters by format.
 *
 * Canonical form is Title Case, with brands and acronyms left intact: MAX and
 * IMAX are VOX product names, not words, and "Imax" would be wrong.
 */
const FORMAT_ACRONYMS = new Set([
  "IMAX", "MAX", "4DX", "MX4D", "2D", "3D", "4D", "2L", "7STAR",
  "VIP", "XXL", "ONYX", "LED", "ATMOS", "4K",
]);

/**
 * Different chains' words for the same ordinary screen. Matched against the
 * whole canonicalised value, never a substring, so "Suites 2D", "Dolby 2D" and
 * "2D/7STAR" keep their meaning — only a bare "2D" is an ordinary screen.
 */
const FORMAT_SYNONYMS: Record<string, string> = {
  Regular: "Standard",
  "2D": "Standard",
};

function canonicalFormat(raw: string | undefined): string {
  const value = raw?.replace(/\s+/g, " ").trim();
  if (!value) return "";
  const cased = value
    // Keep separators so "2D/7STAR" and "Couch - 2 Seater" survive intact.
    .split(/([\s/-])/)
    .map((part) => {
      if (!part || /^[\s/-]$/.test(part)) return part;
      const upper = part.toUpperCase();
      if (FORMAT_ACRONYMS.has(upper)) return upper;
      return upper.charAt(0) + part.slice(1).toLowerCase();
    })
    .join("");
  return FORMAT_SYNONYMS[cased] ?? cased;
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x3D;/gi, "=")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

const GENERIC_TITLES = new Set([
  "title", "name", "example", "sample", "lorem ipsum", "n/a", "na", "tbd",
  "untitled", "movie", "film", "event",
]);

function isPlaceholderTitle(raw: string | undefined): boolean {
  const value = raw?.trim() ?? "";
  if (value.length < 2) return true;
  const lower = value.toLowerCase();
  if (GENERIC_TITLES.has(lower)) return true;
  if (/^\d+([.,]\d+)?$/.test(lower)) return true;
  if (/^(film|movie|event)\s*(title)?\s*\d*$/i.test(lower)) return true;
  return false;
}

/**
 * Chips wrap the chain URL in a tracking interstitial:
 *   cinema.aptrixx.com/uaeplaceholder/index.php?booklink=<encoded chain url>
 * Resolve to the chain URL itself: routing our users through a competitor's
 * click tracker adds a redirect hop and hands them our traffic data.
 */
function unwrapBooking(attrs: string | undefined): string | null {
  if (!attrs) return null;
  const m = /booklink=([^"&'\s]+)/.exec(attrs);
  if (!m) return null;
  let target: string;
  try {
    target = decodeURIComponent(decodeEntities(m[1]!));
  } catch {
    return null;
  }
  if (!target || target === "0") return null;
  try {
    const u = new URL(target);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

type Screening = {
  chainKey: string;
  citySlug: string;
  venue: string;
  time: string;
  format: string;
  bookingUrl: string | null;
};

const BLOCK_RX = /<article class="card-panel showtime-block">([\s\S]*?)<\/article>/g;
const VENUE_RX = /<a href="([^"]+)" class="cinema-link">([^<]+)<\/a>/;
const CHAIN_RX = /badge-company[^>]*>([^<]+)</;
// Anchored on the inner time span so `time-chip-time` / `time-chip-exp` spans
// are not themselves mistaken for chips.
const CHIP_RX =
  /<(?:a|span)([^>]*class="(time-chip(?:\s[^"]*)?)"[^>]*)>\s*<span class="time-chip-time">([^<]*)<\/span>(?:\s*<span class="time-chip-exp">([^<]*)<\/span>)?/g;

export type MovieMeta = {
  poster: string | null;
  /**
   * Their poster filenames are IMDb ids (…/posters_original/tt22084616.jpg).
   * Worth keeping as a first-class field: it is a stable cross-source join key
   * that lets us resolve our own artwork instead of hotlinking theirs forever.
   */
  imdbId: string | null;
  genre: string | null;
  language: string | null;
  rating: string | null;
  durationMins: number | null;
  synopsis: string | null;
  /**
   * From the page's Movie JSON-LD, which carries `director` as a Person node.
   * Their markup repeats it, but the structured version is the one that will
   * survive a redesign.
   */
  director: string | null;
  /**
   * Cast is markup-only — their JSON-LD has no `actor` — so this reads the
   * "Cast: A, B, C" line. Capped at the billed few: a full list is a credits
   * page, and the film page shows a line, not a scroll.
   */
  cast: string[];
};

/** "Cast:</strong> Jason Statham, Annabelle Wallis" -> the names. */
const CAST_RX = /Cast:\s*<\/(?:strong|b)>\s*([^<]{2,300})/i;
const MAX_CAST = 4;

const LD_RX = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
const META_DESC_RX = /<meta name="description" content="([^"]*)"/i;

/**
 * Film metadata comes from the page's schema.org JSON-LD rather than its
 * markup: it is structured, and far less likely to break on a redesign.
 */
export function parseMovieMeta(html: string): MovieMeta {
  let ld: Record<string, unknown> | null = null;
  for (const block of html.matchAll(LD_RX)) {
    try {
      const parsed = JSON.parse(block[1]!) as Record<string, unknown>;
      if (parsed && parsed["@type"] === "Movie") {
        ld = parsed;
        break;
      }
    } catch {
      // The page also carries a BreadcrumbList block; ignore anything unparseable.
    }
  }

  const genre = typeof ld?.["genre"] === "string" ? (ld["genre"] as string).trim() : null;

  // Language is absent from the JSON-LD, but the meta description reliably ends
  // "<Language> <Genre>." — e.g. "…in all UAE cinemas. Malayalam Crime, Thriller."
  // so removing the genre leaves the language.
  let language: string | null = null;
  const desc = META_DESC_RX.exec(html)?.[1];
  if (desc) {
    const tail = /in all UAE cinemas\.\s*(.+?)\.?\s*$/i.exec(decodeEntities(desc))?.[1];
    if (tail) {
      const stripped = (genre ? tail.replace(genre, "") : tail).replace(/[.,\s]+$/, "").trim();
      if (stripped && stripped.length <= 40) language = stripped;
    }
  }

  const dur = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(String(ld?.["duration"] ?? ""));
  const durationMins = dur ? Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0) : 0;

  const image = ld?.["image"];
  const synopsis = ld?.["description"];
  const rating = ld?.["contentRating"];

  const poster = typeof image === "string" && image.startsWith("http") ? image : null;

  return {
    poster,
    imdbId: poster ? (/(tt\d{6,})/.exec(poster)?.[1] ?? null) : null,
    genre: genre || null,
    language,
    rating: typeof rating === "string" && rating.trim() ? rating.trim() : null,
    durationMins: durationMins > 0 ? durationMins : null,
    synopsis:
      typeof synopsis === "string" && synopsis.trim() ? decodeEntities(synopsis).trim() : null,
    director: parseDirector(ld),
    cast: parseCast(html),
  };
}

/** JSON-LD `director` is a Person node, or occasionally a list of them. */
function parseDirector(ld: Record<string, unknown> | null): string | null {
  const raw = ld?.["director"];
  const nameOf = (value: unknown): string | null => {
    if (typeof value === "string") return value.trim() || null;
    if (value && typeof value === "object") {
      const name = (value as Record<string, unknown>)["name"];
      return typeof name === "string" && name.trim() ? name.trim() : null;
    }
    return null;
  };
  const names = (Array.isArray(raw) ? raw : [raw]).map(nameOf).filter(Boolean) as string[];
  return names.length > 0 ? decodeEntities(names.join(", ")) : null;
}

function parseCast(html: string): string[] {
  const line = CAST_RX.exec(html)?.[1];
  if (!line) return [];
  return decodeEntities(line)
    .split(/\s*,\s*/)
    .map((name) => name.trim())
    // Guards against a stray sentence being split on its commas. Bounded by word
    // count rather than by punctuation: initials and suffixes are normal in the
    // Tamil, Telugu and Hindi titles that make up much of this catalogue, so a
    // full-stop rule would quietly drop "S. S. Rajamouli" and "Robert Downey Jr."
    .filter(
      (name) =>
        name.length > 1 && name.length <= 60 && name.split(/\s+/).length <= 5,
    )
    .slice(0, MAX_CAST);
}

/** Pure: movie-page HTML -> flat screening rows. No network; unit-testable. */
export function parseMoviePage(html: string): {
  title: string | null;
  meta: MovieMeta;
  screenings: Screening[];
} {
  const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]!).trim() : null;
  const meta = parseMovieMeta(html);
  const screenings: Screening[] = [];

  for (const block of html.matchAll(BLOCK_RX)) {
    const body = block[1]!;
    const venueMatch = VENUE_RX.exec(body);
    if (!venueMatch) continue;
    const citySlug = (venueMatch[1] ?? "").split("/")[1] ?? "";
    const venue = decodeEntities(venueMatch[2] ?? "").trim();
    const chainKey = CHAIN_KEYS[(CHAIN_RX.exec(body)?.[1] ?? "").trim().toUpperCase()];
    if (!chainKey || !venue) continue;

    for (const chip of body.matchAll(CHIP_RX)) {
      const time = normalizeTime(decodeEntities(chip[3] ?? ""));
      if (!time) continue;
      screenings.push({
        chainKey,
        citySlug,
        venue,
        time,
        format: canonicalFormat(decodeEntities(chip[4] ?? "")),
        bookingUrl: unwrapBooking(chip[1]),
      });
    }
  }
  return { title, meta, screenings };
}

type CacheEntry = {
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  fetched_at: string | null;
};

type FetchResult =
  | { status: "unchanged" }
  | { status: "ok"; html: string; etag: string | null; lastModified: string | null };

/**
 * Conditional GET. We re-read the same ~127 pages continuously, and almost
 * none of them change between passes, so replaying the stored validators lets
 * their server answer 304 with no body: nothing to download, nothing to parse,
 * and a fraction of the load on a small independent site.
 */
async function fetchConditional(
  url: string,
  cached: CacheEntry | undefined,
  timeoutMs = 20_000,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
    };
    if (cached?.etag) headers["if-none-match"] = cached.etag;
    if (cached?.last_modified) headers["if-modified-since"] = cached.last_modified;

    const res = await fetch(url, { headers, signal: controller.signal });
    if (res.status === 304) return { status: "unchanged" };
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return {
      status: "ok",
      html: await res.text(),
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function movieUrls(): Promise<string[]> {
  const xml = await fetchText(SITEMAP);
  return [
    ...new Set(
      [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => m[1]!.trim())
        .filter((u) => u.includes("/movie/")),
    ),
  ];
}

async function runScrape(request: Request) {
  // Lovable Cloud never exposes the Supabase service-role key, so writes go
  // through the `ingest_cinema_films` SECURITY DEFINER function instead: the
  // public key plus a dedicated ingest token that can only upsert showtimes.
  // That is also a smaller blast radius than a service-role key, which can
  // read and write every table including auth data.
  const SUPABASE_URL =
    import.meta.env?.["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const SUPABASE_KEY =
    import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"];
  const INGEST_TOKEN = process.env["SCRAPER_INGEST_TOKEN"];
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ ok: false, error: "Supabase config missing" }, { status: 500 });
  }
  if (!INGEST_TOKEN) {
    return Response.json(
      { ok: false, error: "SCRAPER_INGEST_TOKEN is not configured" },
      { status: 500 },
    );
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const url = new URL(request.url);

  const requested = url.searchParams.get("chains");
  const only = requested
    ? new Set(requested.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean))
    : null;

  const startedAt = Date.now();
  const runStartedAt = new Date().toISOString();
  const today = dubaiToday();

  let pages: string[];
  try {
    pages = await movieUrls();
  } catch (error) {
    return Response.json(
      { ok: false, error: `sitemap unreachable: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }

  /**
   * Where to start the walk.
   *
   * An explicit ?offset= still wins, so a manual run can target a page. With no
   * offset the route paces itself from the clock rather than from a cursor in
   * the database.
   *
   * The cursor version needed scraper_cursor.step to match how many pages a run
   * actually completes. That number is a property of this code — it changed
   * from 45 to ~30 to 12 in a single afternoon as the scrape went from one day
   * to three — and every time it changed, a step nobody updated silently
   * skipped pages. Deriving the offset here keeps the two in the same file.
   *
   * Each PACE_WINDOW_MS tick advances by PAGES_PER_RUN, so consecutive fires
   * walk consecutive stretches and the whole sitemap is covered on a rotation.
   * Overlap is harmless; only overshoot loses pages, so PAGES_PER_RUN is set
   * below what a run measurably completes.
   */
  const explicitOffset = url.searchParams.get("offset");
  const autoOffset =
    Math.floor(Date.now() / PACE_WINDOW_MS) * PAGES_PER_RUN % Math.max(1, pages.length);
  const offset =
    explicitOffset === null
      ? autoOffset
      : Math.max(0, Number(explicitOffset) || 0) % Math.max(1, pages.length);
  const ordered = [...pages.slice(offset), ...pages.slice(0, offset)];

  // Validators and last-known content hashes for the pages we are about to
  // walk, so unchanged pages cost a 304 and nothing else.
  const cache = new Map<string, CacheEntry & { film_keys: string[] }>();
  {
    // One entry per page, not per day: the hash now covers every day the page
    // produced, because a page is written all-or-nothing.
    const window = ordered.slice(0, 60);
    const { data: cached } = await db.rpc("page_cache_get", {
      p_token: INGEST_TOKEN,
      p_urls: window,
    });
    for (const row of (cached ?? []) as Array<CacheEntry & { url: string; film_keys: string[] }>) {
      cache.set(row.url, row);
    }
  }

  const rows = new Map<string, Record<string, unknown>>();
  const touchedChains = new Set<string>();
  const cacheWrites: Array<Record<string, unknown>> = [];
  const keepAlive: string[] = [];
  let visited = 0;
  let pagesWalked = 0;
  let failed = 0;
  let notModified = 0;
  let unchangedContent = 0;

  for (const page of ordered) {
    // Budget is checked once per page, never between its days. A page is
    // written as a whole — see below — so stopping half way through one would
    // produce exactly the partial write this guards against. Overshoot is
    // bounded by SCRAPE_DAYS fetches, which the headroom under the caller's
    // 120s timeout absorbs.
    if (Date.now() - startedAt > BUDGET_MS) break;
    pagesWalked += 1;

    const cachedEntry = cache.get(page);

    /**
     * All three days are read together, unconditionally, and the page is
     * written all-or-nothing.
     *
     * ingest_cinema_films REPLACES a film's showtimes rather than merging, so
     * any write that is missing a day deletes that day. Two things made that
     * happen: a per-day 304 meant we never parsed that day and rebuilt the row
     * without it, and a budget check between days could stop a page after d=0.
     * Both silently destroyed tomorrow's screenings for films we had already
     * scraped correctly.
     *
     * So: no per-day validators, and one hash covering every day. We lose the
     * bandwidth a 304 would have saved, which is the cheaper half of the round
     * trip anyway, and gain the guarantee that what we write is complete.
     */
    const dayResults: Array<{ dayKey: string; parsed: ReturnType<typeof parseMoviePage> }> = [];
    let pageFailed = false;

    for (let dayIndex = 0; dayIndex < SCRAPE_DAYS; dayIndex += 1) {
      const dayKey = dubaiDayPlus(dayIndex);
      const dayUrl = dayIndex === 0 ? page : `${page}?d=${dayIndex}`;

      let fetched: FetchResult;
      try {
        fetched = await fetchConditional(dayUrl, undefined);
        visited += 1;
      } catch {
        failed += 1;
        pageFailed = true;
        break;
      }

      // No validators were sent, so a 304 should be impossible. If the origin
      // sends one anyway, treat it as a failed read rather than inventing an
      // empty day: an empty day here would delete that day's screenings.
      if (fetched.status === "unchanged") {
        notModified += 1;
        pageFailed = true;
        break;
      }

      const parsed = parseMoviePage(fetched.html);
      dayResults.push({ dayKey, parsed });

      // Most of the sitemap is coming-soon titles with no screenings at all.
      // Asking those for tomorrow and the day after would triple the load we
      // put on the source to learn the same nothing three times over.
      if (dayIndex === 0 && parsed.screenings.length === 0) break;

      await sleep(PAGE_DELAY_MS);
    }

    // A page that could not be read in full is left exactly as it was. Writing
    // what we did get would delete the days we did not.
    if (pageFailed || dayResults.length === 0) {
      await sleep(PAGE_DELAY_MS);
      continue;
    }

    const title = dayResults[0]!.parsed.title;
    const meta = dayResults[0]!.parsed.meta;

    // One hash for the whole page, including every day it covers and the day it
    // was taken on. The date is in there because screenings are stamped with
    // the day we read them, so an unchanged page must still be rewritten once
    // the date rolls over.
    const contentHash = await sha256(
      JSON.stringify({
        days: dayResults.map((d) => d.dayKey),
        title,
        meta,
        screenings: dayResults.map((d) => d.parsed.screenings),
      }),
    );

    const cachedDay = cachedEntry?.fetched_at
      ? dubaiDayOf(new Date(cachedEntry.fetched_at))
      : null;
    const cacheUsable =
      (cachedEntry?.film_keys?.length ?? 0) > 0 && cachedDay === today ? cachedEntry : undefined;

    // A chain-filtered run ignores the cache in both directions: it must not
    // skip a page whose rows it has never written for the chain being asked
    // for, and it must not refresh an entry it is only half reading.
    if (!only && cacheUsable?.content_hash && cacheUsable.content_hash === contentHash) {
      unchangedContent += 1;
      keepAlive.push(...(cacheUsable.film_keys ?? []));
      cacheWrites.push({ url: page, etag: null, last_modified: null, content_hash: contentHash, unchanged: true });
      await sleep(PAGE_DELAY_MS);
      continue;
    }

    const pageKeys: string[] = [];
    if (title && !isPlaceholderTitle(title)) {
      const key0 = titleKey(title);
      for (const { dayKey, parsed } of dayResults) {
        for (const s of parsed.screenings) {
          if (only && !only.has(s.chainKey)) continue;
          touchedChains.add(s.chainKey);
          const city = CITY_NAMES[s.citySlug] ?? "";
          const key = `${s.chainKey}|${key0}|${city}`;
          if (!pageKeys.includes(key)) pageKeys.push(key);
          let row = rows.get(key);
          if (!row) {
            row = {
              cinema: s.chainKey,
              title,
              title_key: key0,
              city,
              venues: [] as string[],
              formats: [] as string[],
              showtimes: [] as Array<Record<string, string>>,
              // Deliberately the chain's own site, not the page we read. The UI
              // falls back to source_url when a screening has no link of its
              // own, and pointing that at cinemauae would hand them our clicks.
              source_url: CHAIN_HOME[s.chainKey] ?? "",
              booking_url: null as string | null,
              poster_url: meta.poster,
              imdb_id: meta.imdbId,
              genre: meta.genre,
              language: meta.language,
              rating: meta.rating,
              duration_mins: meta.durationMins,
              synopsis: meta.synopsis,
              director: meta.director,
              cast_names: meta.cast,
              is_active: true,
              last_seen_at: runStartedAt,
            };
            rows.set(key, row);
          }
          const venues = row["venues"] as string[];
          if (!venues.includes(s.venue) && venues.length < 60) venues.push(s.venue);
          const formats = row["formats"] as string[];
          if (s.format && !formats.includes(s.format) && formats.length < 20) formats.push(s.format);

          const list = row["showtimes"] as Array<Record<string, string>>;
          // The identity of a screening includes its date now, so the same
          // clock time on two different days both survive.
          if (
            list.length < 1200 &&
            !list.some(
              (x) => x["date"] === dayKey && x["venue"] === s.venue && x["time"] === s.time,
            )
          ) {
            const entry: Record<string, string> = { date: dayKey, time: s.time, venue: s.venue };
            if (s.format) entry["format"] = s.format;
            if (s.bookingUrl) entry["booking_url"] = s.bookingUrl;
            list.push(entry);
          }
        }
      }
    }

    // Never cache a page read through a chain filter. pageKeys only collects
    // the chains that passed the filter, so the entry would claim a page holds
    // fewer films than it does — and because the hash matches, a later full run
    // would skip it as unchanged, leaving the other chains on that page neither
    // re-ingested nor touched, and eventually retired for looking stale.
    // A filtered run is a debugging tool; it must not be able to mask a page
    // from the runs that keep everything else alive.
    if (!only) {
      cacheWrites.push({
        url: page,
        etag: null,
        last_modified: null,
        content_hash: contentHash,
        film_keys: pageKeys,
        unchanged: false,
      });
    }
    await sleep(PAGE_DELAY_MS);
  }

  // Pages, not fetches: each page now costs up to three requests, so counting
  // `visited` here would declare the walk finished after a third of it.
  const complete = pagesWalked >= ordered.length;
  const batch = [...rows.values()];

  // Persist validators, and refresh last_seen_at for films whose pages were
  // unchanged — skipping their upsert must not look like they stopped showing.
  const flushSideEffects = async () => {
    if (cacheWrites.length > 0) {
      await db.rpc("page_cache_put", { p_token: INGEST_TOKEN, p_rows: cacheWrites });
    }
    if (keepAlive.length > 0) {
      await db.rpc("touch_films", { p_token: INGEST_TOKEN, p_keys: [...new Set(keepAlive)] });
    }
  };

  if (batch.length === 0) {
    await flushSideEffects();
    // Zero rows is the normal outcome for most of the sitemap: only ~46 of its
    // 132 pages are currently-showing films, the rest are coming-soon titles
    // with no screenings at all. An all-unchanged pass is likewise the steady
    // state. A run only failed if it could not read anything.
    const readSomething = visited > failed;
    return Response.json(
      {
        ok: readSomething,
        ranAt: new Date().toISOString(),
        visited,
        // Pages, not fetches, and reported on this branch too: it is the number
        // scraper_cursor.step has to stay under, and a steady state of
        // all-unchanged passes is exactly when you need to read it.
        pagesWalked,
        nextOffset: complete ? 0 : (offset + pagesWalked) % ordered.length,
        pagesTotal: ordered.length,
        failed,
        notModified,
        unchangedContent,
        filmsKeptAlive: new Set(keepAlive).size,
        upserted: 0,
        note: readSomething
          ? "nothing to write: pages unchanged or carrying no screenings"
          : `could not read any of ${visited} page(s)`,
      },
      { status: readSomething ? 200 : 500 },
    );
  }

  // Carry forward booking links captured earlier today. Once a screening has
  // started its chip loses the href, so a fresh scrape alone would silently
  // strip links as the day progresses.
  const keys = batch.map((r) => `${r["cinema"]}|${r["title_key"]}|${r["city"]}`);
  const { data: existing } = await db
    .from("cinema_films")
    .select("cinema, title_key, city, showtimes")
    .in("cinema", [...new Set(batch.map((r) => String(r["cinema"])))]);

  const priorByRow = new Map<string, Map<string, string>>();
  for (const prev of existing ?? []) {
    const rowKey = `${prev.cinema}|${prev.title_key}|${prev.city}`;
    if (!keys.includes(rowKey)) continue;
    const links = new Map<string, string>();
    for (const st of Array.isArray(prev.showtimes) ? prev.showtimes : []) {
      const s = st as Record<string, unknown>;
      const link = typeof s["booking_url"] === "string" ? s["booking_url"] : "";
      if (link) links.set(`${String(s["venue"] ?? "")}|${String(s["time"] ?? "")}`.toLowerCase(), link);
    }
    if (links.size > 0) priorByRow.set(rowKey, links);
  }
  for (const row of batch) {
    const prior = priorByRow.get(`${row["cinema"]}|${row["title_key"]}|${row["city"]}`);
    if (!prior) continue;
    for (const st of row["showtimes"] as Array<Record<string, string>>) {
      if (st["booking_url"]) continue;
      const link = prior.get(`${st["venue"] ?? ""}|${st["time"] ?? ""}`.toLowerCase());
      if (link) st["booking_url"] = link;
    }
  }

  // Film-level fallback, used by screenings that have no link of their own.
  //
  // It must describe the film, not one showing. Taking the first screening's
  // link looked reasonable and was wrong: for chains that publish session URLs
  // it meant a 20:45 Standard chip could open the 18:45 Platinum seat map, and
  // someone following that books the wrong showing.
  //
  // One distinct URL across every screening is a film page (Cine Royal's
  // /chooseScreen/slug) and is the right fallback. Several distinct URLs means
  // they are session-specific and none of them describes the film, so fall back
  // to the chain instead.
  //
  // Reel is the exception. It publishes no screening links at all, so every
  // Reel chip used to fall through to the chain's showtimes page. Their film
  // ids are public (see lib/reel-films), and a film page is a genuine
  // film-level URL — the thing this field is for — so it goes in ahead of the
  // chain. Fetched once per run and only when a Reel row is present.
  //
  // The same feed also carries Reel's own schedule, which is better than what
  // we read second-hand: cinemauae was giving us nothing at all for the third
  // day of our own picker, where Reel publishes a full day of sessions. So a
  // matched Reel row takes its showtimes, venues and screen types from source.
  const dayKeys = Array.from({ length: SCRAPE_DAYS }, (_, i) => dubaiDayPlus(i));
  const reel: ReelFeed = batch.some((row) => row["cinema"] === "reel")
    ? await fetchReelFeed(dayKeys)
    : { films: [], screenings: new Map() };

  for (const row of batch) {
    if (row["cinema"] === "reel" && reel.films.length > 0) {
      const film = matchReelFilm(String(row["title"] ?? ""), reel.films);
      const own = film ? reel.screenings.get(film.id) : undefined;
      if (film) row["booking_url_reel"] = reelMovieUrl(film);
      // Only when the feed actually has screenings: an empty list here would
      // replace a real schedule with nothing, which is the one failure this
      // whole path must not have.
      if (own && own.length > 0) {
        row["showtimes"] = own.map((s) => ({ ...s }));
        row["venues"] = [...new Set(own.map((s) => s.venue))];
        row["formats"] = [...new Set(own.map((s) => s.format))];
      }
    }

    const times = row["showtimes"] as Array<Record<string, string>>;
    const links = new Set(times.map((s) => s["booking_url"]).filter(Boolean));
    const shared = links.size === 1 ? [...links][0]! : null;
    const reelUrl = (row["booking_url_reel"] as string | undefined) ?? null;
    delete row["booking_url_reel"];
    row["booking_url"] = shared ?? reelUrl ?? CHAIN_HOME[String(row["cinema"])] ?? null;
  }

  // Upsert and retirement both happen inside the SECURITY DEFINER function.
  // Retirement there is time-based (nothing untouched for 48h), not
  // "not seen in this run" — runs are budgeted and usually partial, so an
  // unvisited film must never be mistaken for one that stopped showing.
  const { data: ingest, error: ingestError } = await db.rpc("ingest_cinema_films", {
    p_token: INGEST_TOKEN,
    p_rows: batch,
  });
  if (ingestError) {
    return Response.json(
      { ok: false, error: `ingest failed: ${ingestError.message}`, visited },
      { status: 500 },
    );
  }

  // Only record validators after a successful ingest: caching a hash for data
  // we failed to store would make the next run skip it as "already done".
  await flushSideEffects();

  const screenings = batch.reduce((n, r) => n + (r["showtimes"] as unknown[]).length, 0);
  const withLinks = batch.reduce(
    (n, r) =>
      n + (r["showtimes"] as Array<Record<string, string>>).filter((s) => s["booking_url"]).length,
    0,
  );

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    source: ORIGIN,
    pagesTotal: ordered.length,
    visited,
    failed,
    notModified,
    unchangedContent,
    filmsKeptAlive: new Set(keepAlive).size,
    complete,
    // Pages, not fetches. `visited` counts HTTP requests and a page now costs up
    // to SCRAPE_DAYS of them, so advancing by it would step past two thirds of
    // the sitemap every fire and never scrape them at all.
    nextOffset: complete ? 0 : (offset + pagesWalked) % ordered.length,
    pagesWalked,
    chains: [...touchedChains],
    rowsSent: batch.length,
    screenings,
    withBookingLinks: withLinks,
    ingest,
  });
}

export const Route = createFileRoute("/api/public/hooks/scrape-aggregator")({
  server: {
    handlers: {
      POST: async ({ request }) => runScrape(request),
      GET: async ({ request }) => runScrape(request),
    },
  },
});
