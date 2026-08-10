/**
 * POST/GET /api/public/hooks/scrape-cinemas — Cinema showtime scraper.
 *
 * WRITE side of the cinema pipeline. Runs on the server (Cloudflare Worker
 * runtime), never in the browser. Scheduled by pg_cron: incremental every 3h,
 * full refresh daily at 05:00 Dubai.
 *
 * Pipeline per chain (vox | reel | novo | roxy):
 *  1. Firecrawl "extract" against SOURCES with EXTRACT_SCHEMA -> film list
 *     (title, poster, genre, rating, formats, per-venue showtimes, links).
 *  2. Optional detail pass per film for venue-level times; results are MERGED
 *     with pass 1 so a failed detail scrape never blanks existing data.
 *  3. absoluteUrl() resolves relative hrefs so every time chip deep-links to
 *     that exact screening on the chain's own site.
 *  4. normalizeShowtimes() shapes rows, then upsert into `cinema_films` keyed
 *     by (cinema, title_key); rows not seen this run are deactivated.
 *  5. Every run is logged to `cinema_scrape_runs` (content hash, counts, error).
 *
 * Batching + retries guard against Firecrawl rate limits. This route lives
 * under /api/public/* so schedulers can call it without site auth — keep the
 * handler side-effect-safe and do not return user data.
 */
import { createFileRoute } from "@tanstack/react-router";

type CinemaKey = "vox" | "reel" | "novo" | "roxy";

const SOURCES: Record<CinemaKey, string[]> = {
  vox: ["https://uae.voxcinemas.com/movies/whatson", "https://uae.voxcinemas.com/"],
  reel: ["https://reelcinemas.com/en-ae/showtime", "https://reelcinemas.com/en-ae"],
  novo: ["https://uae.novocinemas.com/moviePages", "https://uae.novocinemas.com/showTime"],
  roxy: ["https://www.theroxycinemas.com/en/movies", "https://www.theroxycinemas.com/en"],
};


const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    films: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          genre: { type: "string" },
          language: { type: "string" },
          rating: { type: "string" },
          duration_mins: { type: "number" },
          poster_url: { type: "string" },
          synopsis: { type: "string" },
          city: { type: "string" },
          venues: { type: "array", items: { type: "string" } },
          formats: { type: "array", items: { type: "string" } },
          showtimes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                venue: { type: "string" },
                date: { type: "string" },
                time: { type: "string" },
                format: { type: "string" },
                booking_url: { type: "string" },
              },
              required: ["time"],
            },
          },
          booking_url: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  required: ["films"],
} as const;

const EXTRACT_PROMPT =
  "Extract every film currently showing in UAE cinemas listed on this page. For each film capture the exact title, genre, spoken language, age rating/certification, runtime in minutes, poster image URL, a one-line synopsis, the emirate/city (Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain or Al Ain) if shown, cinema venue names, screen formats (IMAX, 4DX, MAX, THEATRE by Rhodes, Standard etc.) and the booking link. For showtimes, return one object per screening with the exact clock time (e.g. '19:45' or '7:45 PM'), the calendar date in yyyy-mm-dd form when the page shows or implies one (use the currently selected date if the page shows a date tab), the venue/cinema name for that screening, the screen format, and booking_url set to the absolute href of the link/button behind that exact time (the seat-selection or booking URL for that single screening). Never invent times. Ignore adverts, offers and non-film content.";

type RawShowtime = {
  venue?: string;
  date?: string;
  time?: string;
  format?: string;
  booking_url?: string;
};

/** Screening links are often relative; anchor them to the scraped page. */
function absoluteUrl(raw: string | undefined, base: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const resolved = base ? new URL(value, base) : new URL(value);
    return resolved.protocol === "http:" || resolved.protocol === "https:"
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
}

type RawFilm = {
  title?: string;
  genre?: string;
  language?: string;
  rating?: string;
  duration_mins?: number;
  poster_url?: string;
  synopsis?: string;
  city?: string;
  venues?: string[];
  formats?: string[];
  showtimes?: Array<string | RawShowtime>;
  booking_url?: string;
};

function dubaiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** yyyy-mm-dd in Dubai time, `days` days from now. */
function dubaiDateOffset(days: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + days * 86_400_000));
}

/**
 * The extractor occasionally hallucinates dates from past years. Only accept
 * a real yyyy-mm-dd inside [today, today + 14 days] in Dubai time; anything
 * else falls back to today.
 */
function sanitizeDate(raw: string | undefined, fallback: string): string {
  const value = raw?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  const min = dubaiToday();
  const max = dubaiDateOffset(14);
  if (value < min || value > max) return fallback;
  return value;
}

/** "7:45pm", "07:45 PM", "19.45" and "19:45" all become 24-hour "HH:MM". */
function normalizeTime(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  const match = value.match(/^(\d{1,2})\s*[:.h]\s*(\d{2})\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.[0];
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;
  if (suffix === "p" && hours < 12) hours += 12;
  if (suffix === "a" && hours === 12) hours = 0;
  if (hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeShowtimes(
  value: unknown,
  defaults?: { date?: string; venue?: string; base?: string },
): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  const today = dubaiToday();
  const fallbackDate = sanitizeDate(defaults?.date, today);
  const out: Array<Record<string, string>> = [];
  const seen = new Set<string>();

  const push = (item: Record<string, string>) => {
    // Never keep screenings that already happened.
    if (item["date"] && item["date"] < today) return;
    const key = `${item["venue"] ?? ""}|${item["date"] ?? ""}|${item["time"]}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  for (const entry of value.slice(0, 400)) {
    if (typeof entry === "string" && entry.trim()) {
      const time = normalizeTime(entry);
      if (!time) continue;
      const item: Record<string, string> = { time, date: fallbackDate };
      if (defaults?.venue) item["venue"] = defaults.venue;
      push(item);
    } else if (entry && typeof entry === "object") {
      const row = entry as RawShowtime;
      const time = normalizeTime(row.time);
      if (!time) continue;
      const item: Record<string, string> = { time };
      item["date"] = sanitizeDate(row.date, fallbackDate);
      const venue = row.venue?.trim() || defaults?.venue;
      if (venue) item["venue"] = venue;
      if (row.format?.trim()) item["format"] = row.format.trim();
      const link = absoluteUrl(row.booking_url, defaults?.base);
      if (link) item["booking_url"] = link;
      push(item);
    }
  }
  return out;
}

/** Language/label suffixes that decorate the same film across chains. */
const TITLE_SUFFIX =
  /\s*[([]\s*(arabic|english|hindi|malayalam|tamil|telugu|kannada|urdu|filipino|tagalog|russian|french|german|spanish|chinese|korean|japanese|dubbed|subtitled|sub(?:titles)?|live[\s-]?action|re[\s-]?release|imax|4dx|3d|2d|roxy ladies|ladies(?: night)?|kids|gold|premium)\b[^)\]]*[)\]]\s*$/i;

function titleKey(title: string) {
  let value = title.trim();
  // Strip any trailing language/label suffix, repeatedly.
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

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function firecrawlScrape(url: string, lovableKey: string, firecrawlKey: string) {
  const response = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": firecrawlKey,
    },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      waitFor: 3000,
      location: { country: "AE", languages: ["en"] },
      formats: ["markdown", { type: "json", schema: EXTRACT_SCHEMA, prompt: EXTRACT_PROMPT }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Firecrawl request failed [${response.status}]: ${text.slice(0, 500)}`);
  }
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const payload = (parsed["data"] ?? parsed) as Record<string, unknown>;
  const markdown = typeof payload["markdown"] === "string" ? (payload["markdown"] as string) : "";
  const json = (payload["json"] ?? {}) as { films?: RawFilm[] };
  return { markdown, films: Array.isArray(json.films) ? json.films : [] };
}

const SHOWTIME_SCHEMA = {
  type: "object",
  properties: {
    showtimes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          venue: { type: "string" },
          time: { type: "string" },
          format: { type: "string" },
          booking_url: { type: "string" },
        },
        required: ["venue", "time"],
      },
    },
  },
  required: ["showtimes"],
} as const;

const SHOWTIME_PROMPT =
  "This is a cinema film page listing today's screenings. Extract every single screening as an object with the cinema/venue name (e.g. 'Mall of the Emirates', 'Dragon Mart'), the exact start time exactly as printed (e.g. '7:45pm' or '10:15 PM'), the screen format/experience if shown (Standard, MAX, IMAX, GOLD, THEATRE, 4DX, 2D, 7STAR), and booking_url set to the absolute href of the anchor/button wrapping that exact time (the seat-selection or booking link for that single screening). Include every venue and every time. Do not invent or round times, and ignore trailers, other movie suggestions and promotions.";

/** Second pass: film detail pages carry the real per-venue showtimes. */
async function scrapeShowtimesForFilms(
  cinema: CinemaKey,
  today: string,
  lovableKey: string,
  firecrawlKey: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: films } = await supabaseAdmin
    .from("cinema_films")
    .select("id, booking_url, source_url, showtimes")
    .eq("cinema", cinema)
    .eq("is_active", true);

  const targets = (films ?? []).filter((f) => f.booking_url?.startsWith("http"));
  let updated = 0;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const scrapeOne = async (film: (typeof targets)[number], attempt = 0): Promise<void> => {
    try {
      const response = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": firecrawlKey,
        },
        body: JSON.stringify({
          url: film.booking_url,
          onlyMainContent: true,
          waitFor: 8000,
          location: { country: "AE", languages: ["en"] },
          // Markdown carries the anchor hrefs the extractor needs for per-time links.
          formats: ["markdown", { type: "json", schema: SHOWTIME_SCHEMA, prompt: SHOWTIME_PROMPT }],
        }),
      });
      // Firecrawl caps requests per minute; back off and retry instead of
      // silently leaving the film without showtimes.
      if (response.status === 429 && attempt < 2) {
        await sleep(35_000);
        return scrapeOne(film, attempt + 1);
      }
      if (!response.ok) return;
      const parsed = (await response.json()) as Record<string, unknown>;
      const payload = (parsed["data"] ?? parsed) as Record<string, unknown>;
      const json = (payload["json"] ?? {}) as { showtimes?: RawShowtime[] };
      const showtimes = normalizeShowtimes(json.showtimes ?? [], {
        date: today,
        ...(film.booking_url ? { base: film.booking_url } : {}),
      });
      if (showtimes.length === 0) return;
      // Keep per-screening links captured on the listing pass when the detail
      // pass could not find an href for that time.
      const previous = Array.isArray(film.showtimes)
        ? (film.showtimes as Array<Record<string, unknown>>)
        : [];
      const priorLinks = new Map<string, string>();
      for (const row of previous) {
        const link = typeof row["booking_url"] === "string" ? row["booking_url"] : "";
        const time = typeof row["time"] === "string" ? row["time"] : "";
        if (link && time) priorLinks.set(`${String(row["venue"] ?? "")}|${time}`.toLowerCase(), link);
      }
      for (const row of showtimes) {
        if (row["booking_url"]) continue;
        const key = `${row["venue"] ?? ""}|${row["time"] ?? ""}`.toLowerCase();
        const link = priorLinks.get(key) ?? priorLinks.get(`|${row["time"] ?? ""}`.toLowerCase());
        if (link) row["booking_url"] = link;
      }
      const venues = [
        ...new Set(showtimes.map((s) => s["venue"]).filter(Boolean) as string[]),
      ].slice(0, 40);
      await supabaseAdmin
        .from("cinema_films")
        .update({ showtimes, ...(venues.length > 0 ? { venues } : {}) })
        .eq("id", film.id);
      updated += 1;
    } catch {
      // A single film page failing must not abort the run.
    }
  };

  // Batches of 3 with a pause keep us inside the Firecrawl rate limit.
  for (let i = 0; i < targets.length; i += 3) {
    await Promise.all(targets.slice(i, i + 3).map((film) => scrapeOne(film)));
    if (i + 3 < targets.length) await sleep(6000);
  }


  return updated;
}


async function scrapeCinema(
  cinema: CinemaKey,
  force: boolean,
  lovableKey: string,
  firecrawlKey: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const runStartedAt = new Date().toISOString();

  let lastError: unknown = null;
  for (const url of SOURCES[cinema]) {
    try {
      const { markdown, films } = await firecrawlScrape(url, lovableKey, firecrawlKey);
      const contentHash = await sha256(markdown || JSON.stringify(films));

      // Incremental load: skip writes entirely when the page content is unchanged.
      const { data: previous } = await supabaseAdmin
        .from("cinema_scrape_runs")
        .select("content_hash")
        .eq("cinema", cinema)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!force && previous?.content_hash && previous.content_hash === contentHash) {
        await supabaseAdmin
          .from("cinema_films")
          .update({ last_seen_at: runStartedAt })
          .eq("cinema", cinema)
          .eq("is_active", true);
        await supabaseAdmin.from("cinema_scrape_runs").insert({
          cinema,
          source_url: url,
          content_hash: contentHash,
          changed: false,
          status: "success",
        });
        return { cinema, changed: false, upserted: 0, deactivated: 0, source: url };
      }

      const rows = films
        .filter((film) => typeof film.title === "string" && film.title.trim().length > 1)
        .map((film) => ({
          cinema,
          title: film.title!.trim(),
          title_key: titleKey(film.title!),
          // Empty string, never null: Postgres treats NULLs as distinct, which
          // made the (cinema, title_key, city) upsert insert a new row per run.
          city: film.city?.trim() || "",
          venues: Array.isArray(film.venues) ? film.venues.filter(Boolean).slice(0, 40) : [],
          genre: film.genre?.trim() || null,
          language: film.language?.trim() || null,
          rating: film.rating?.trim() || null,
          duration_mins:
            typeof film.duration_mins === "number" && film.duration_mins > 0
              ? Math.round(film.duration_mins)
              : null,
          poster_url: film.poster_url?.trim() || null,
          synopsis: film.synopsis?.trim() || null,
          formats: Array.isArray(film.formats) ? film.formats.filter(Boolean).slice(0, 20) : [],
          showtimes: normalizeShowtimes(film.showtimes, {
            base: url,
            ...(Array.isArray(film.venues) && film.venues.filter(Boolean)[0]
              ? { venue: film.venues.filter(Boolean)[0] as string }
              : {}),
          }),


          booking_url: film.booking_url?.trim() || null,
          source_url: url,
          is_active: true,
          last_seen_at: runStartedAt,
        }));

      if (rows.length === 0) {
        throw new Error("No films extracted from page");
      }

      // Dedupe on the unique key before upserting.
      const unique = new Map<string, (typeof rows)[number]>();
      for (const row of rows) unique.set(`${row.title_key}|${row.city}`, row);

      // Films whose listing page carries no times keep the schedule we already
      // have, so a rate-limited detail pass never blanks the board.
      const all = [...unique.values()];
      const withTimes = all.filter((row) => row.showtimes.length > 0);
      const withoutTimes = all.map(({ showtimes: _showtimes, ...rest }) => rest).filter((row) => {
        const match = all.find((r) => r.title_key === row.title_key && r.city === row.city);
        return (match?.showtimes.length ?? 0) === 0;
      });

      for (const batch of [withTimes, withoutTimes]) {
        if (batch.length === 0) continue;
        const { error: upsertError } = await supabaseAdmin
          .from("cinema_films")
          .upsert(batch, { onConflict: "cinema,title_key,city" });
        if (upsertError) throw new Error(upsertError.message);
      }


      // Anything not seen in this run is no longer showing.
      const { data: removed } = await supabaseAdmin
        .from("cinema_films")
        .update({ is_active: false })
        .eq("cinema", cinema)
        .eq("is_active", true)
        .lt("last_seen_at", runStartedAt)
        .select("id");

      await supabaseAdmin.from("cinema_scrape_runs").insert({
        cinema,
        source_url: url,
        content_hash: contentHash,
        changed: true,
        films_upserted: unique.size,
        films_deactivated: removed?.length ?? 0,
        status: "success",
      });

      return {
        cinema,
        changed: true,
        upserted: unique.size,
        deactivated: removed?.length ?? 0,
        source: url,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[scrape-cinemas] ${cinema} failed:`, message);
  await supabaseAdmin.from("cinema_scrape_runs").insert({
    cinema,
    status: "error",
    error: message.slice(0, 1000),
  });
  return { cinema, changed: false, upserted: 0, deactivated: 0, error: message };
}

async function runScrape(request: Request) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !firecrawlKey) {
    return Response.json({ error: "Scraper credentials are not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("cinema");
  const force = url.searchParams.get("force") === "1";
  const keys = (Object.keys(SOURCES) as CinemaKey[]).filter(
    (key) => !requested || key === requested,
  );
  if (keys.length === 0) {
    return Response.json({ error: "Unknown cinema" }, { status: 400 });
  }

  const results: Array<Record<string, unknown> & { cinema: CinemaKey; error?: string }> =
    await Promise.all(keys.map((key) => scrapeCinema(key, force, lovableKey, firecrawlKey)));

  // Second pass for real per-venue showtimes (skip with times=0).
  if (url.searchParams.get("times") !== "0") {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const result of results) {
      if (result.error) continue;
      result["showtimesUpdated"] = await scrapeShowtimesForFilms(
        result.cinema,
        today,
        lovableKey,
        firecrawlKey,
      );
    }
  }

  return Response.json({ ok: true, ranAt: new Date().toISOString(), results });
}

export const Route = createFileRoute("/api/public/hooks/scrape-cinemas")({
  server: {
    handlers: {
      POST: async ({ request }) => runScrape(request),
      GET: async ({ request }) => runScrape(request),
    },
  },
});
