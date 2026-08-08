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
          showtimes: { type: "array", items: { type: "string" } },
          booking_url: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  required: ["films"],
} as const;

const EXTRACT_PROMPT =
  "Extract every film currently showing in UAE cinemas listed on this page. For each film capture the exact title, genre, spoken language, age rating/certification, runtime in minutes, poster image URL, a one-line synopsis, the emirate/city (Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain or Al Ain) if shown, cinema venue names, screen formats (IMAX, 4DX, MAX, THEATRE by Rhodes, Standard etc.), any listed showtimes as plain strings, and the booking link. Ignore adverts, offers and non-film content.";

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
  showtimes?: string[];
  booking_url?: string;
};

function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
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
          city: film.city?.trim() || null,
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
          showtimes: Array.isArray(film.showtimes) ? film.showtimes.filter(Boolean).slice(0, 60) : [],
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
      for (const row of rows) unique.set(`${row.title_key}|${row.city ?? ""}`, row);

      const { error: upsertError } = await supabaseAdmin
        .from("cinema_films")
        .upsert([...unique.values()], { onConflict: "cinema,title_key,city" });
      if (upsertError) throw new Error(upsertError.message);

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

  const results = await Promise.all(
    keys.map((key) => scrapeCinema(key, force, lovableKey, firecrawlKey)),
  );

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
