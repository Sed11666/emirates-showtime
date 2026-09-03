/**
 * GET/POST /api/public/hooks/resolve-posters — replace hotlinked artwork.
 *
 * The aggregator scraper takes poster URLs straight off cinemauae.com, which
 * serves them from its own CDN (cinema.aptrixx.com). That works, but it leans
 * on a competitor's bandwidth for every page view and they can rename or block
 * those paths whenever they like — one change and the whole catalogue loses its
 * artwork.
 *
 * Their filenames happen to be IMDb ids (…/posters_original/tt22084616.jpg), so
 * we already hold a stable cross-source key. This route trades each id for the
 * same film on TMDB and stores image.tmdb.org instead: a CDN that exists to be
 * linked, under terms that permit it, with no dependency on a rival staying
 * friendly.
 *
 * Cheap by design — it resolves distinct IMDb ids, not rows. 300 films across
 * seven chains is only ~33 real titles, so a full pass is a few dozen requests.
 * Already-resolved films are skipped, so steady-state runs do almost nothing.
 *
 * Requires TMDB_API_KEY and SCRAPER_INGEST_TOKEN. Without the former it exits
 * cleanly rather than failing: hotlinked posters are worse than ours, but far
 * better than none, so this is an upgrade path and never a hard dependency.
 */
import { createFileRoute } from "@tanstack/react-router";

const TMDB_FIND = "https://api.themoviedb.org/3/find";
/** w500 is the usual poster width: sharp on retina cards, ~50-80KB. */
const TMDB_IMAGE = "https://image.tmdb.org/t/p/w500";
/**
 * Backdrops are 16:9 stills, which is what a hero needs. The hero was being
 * given the poster: a 310x459 portrait blown up 6x into a ~1876x700 frame and
 * cropped to a quarter of its height, which is why it looked soft and zoomed
 * while the same image stayed sharp on the cards, where it is downscaled.
 * w1280 into that frame is a 1.5x upscale on a correctly shaped image.
 */
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";

/**
 * The IMDb id for a film, from the column if it is set and otherwise from the
 * poster filename.
 *
 * The header above notes the filenames are IMDb ids, but this route only ever
 * read the column — and the column is nearly always empty, because
 * ingest_cinema_films does not accept imdb_id: the scraper sends it and the
 * function's jsonb_to_recordset drops it silently. Measured on live data, that
 * left 13 of 46 titles reachable where the filenames give 41.
 */
export function imdbIdFor(row: { imdb_id?: string | null; poster_url?: string | null }): string | null {
  const column = (row.imdb_id ?? "").trim();
  if (/^tt\d{6,}$/.test(column)) return column;
  return /\/(tt\d{6,})\./.exec(row.poster_url ?? "")?.[1] ?? null;
}

const BUDGET_MS = 40_000;
const REQUEST_DELAY_MS = 120; // TMDB allows ~50 req/s; nowhere near it.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * TMDB issues two credentials that look nothing alike and are easy to confuse:
 * a v3 "API Key" (32 hex chars, sent as `?api_key=`) and a v4 "API Read Access
 * Token" (a JWT, sent as `Authorization: Bearer`). Both authenticate /3/find.
 * Copying the wrong one out of the TMDB dashboard is the single likeliest way
 * to configure this route and get nothing but silent 401s, so accept either
 * rather than making whoever sets it up care which they grabbed.
 */
function tmdbAuth(credential: string): { query: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { accept: "application/json" };
  // A v4 token is a JWT: "ey..." plus three dot-separated segments. A v3 key is
  // 32 hex chars and contains no dots, so this cannot confuse the two.
  const trimmed = credential.trim();
  if (trimmed.startsWith("ey") && trimmed.split(".").length === 3) {
    return { query: "", headers: { ...headers, authorization: `Bearer ${trimmed}` } };
  }
  return { query: `&api_key=${encodeURIComponent(trimmed)}`, headers };
}

const OMDB = "https://www.omdbapi.com/";
const TMDB_PROFILE = "https://image.tmdb.org/t/p/w185";
const TMDB_GENRE_LIST = "https://api.themoviedb.org/3/genre/movie/list";
const TMDB_MOVIE = "https://api.themoviedb.org/3/movie";

/** How many billed performers to keep. The row scrolls, so this is about how
 *  deep TMDB billing stays useful rather than about fitting a screen. */
const CAST_LIMIT = 10;

type TmdbArt = {
  poster: string | null;
  backdrop: string | null;
  /** TMDB's own id, needed for the credits call. Present in the same response. */
  tmdbId: number | null;
  /** TMDB's numeric genre ids. Names come from the per-run map below. */
  genreIds: number[];
};

/**
 * TMDB's genre id-to-name map.
 *
 * Fetched once per run rather than per film: it is ~19 entries and changes
 * about never, but it is the only way to turn the genre_ids the find endpoint
 * already returns into names. One request for the whole pass.
 *
 * Returns an empty map on failure rather than throwing. Genres are the least
 * important thing this route writes, and losing them must not cost the artwork
 * and ratings the same pass is collecting.
 */
async function tmdbGenreMap(apiKey: string): Promise<Map<number, string>> {
  try {
    const { query, headers } = tmdbAuth(apiKey);
    const res = await fetch(`${TMDB_GENRE_LIST}?${query.replace(/^&/, "")}`, { headers });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { genres?: Array<{ id?: number; name?: string }> };
    return new Map(
      (data.genres ?? [])
        .filter((g): g is { id: number; name: string } =>
          typeof g.id === "number" && typeof g.name === "string",
        )
        .map((g) => [g.id, g.name]),
    );
  } catch {
    return new Map();
  }
}

export type FilmMeta = {
  imdb_id: string;
  imdb_rating: number | null;
  imdb_votes: number | null;
  rt_score: number | null;
  metascore: number | null;
  cast_credits: Array<{
    name: string;
    character: string | null;
    profile: string | null;
  }> | null;
  /**
   * Genres from TMDB, which replace cinemauae's in the UI.
   *
   * The source's own field is unreliable: its page for "Im Game" says
   * "genre":"Fantasy" for an Action/Crime/Thriller film, and 19 of 52 titles
   * arrive with one genre where the film has three or four. Stored in its own
   * column because the scraper upserts the genre column every 15 minutes and
   * would overwrite anything written back into it.
   */
  tmdb_genres: string[] | null;
};

/** "7.4" → 7.4, "N/A" → null. OMDb uses the string "N/A" for every absent field. */
function num(value: unknown): number | null {
  if (typeof value !== "string" || value === "N/A") return null;
  const n = Number(value.replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * IMDb, Rotten Tomatoes and Metacritic in one call.
 *
 * OMDb returns all three keyed by imdbID, which is why this is one request per
 * film rather than three. Everything is optional: a regional release often has
 * an IMDb entry and no critic scores at all, and the UI renders only what came
 * back rather than a row of "N/A".
 */
async function omdbRatings(imdbId: string, apiKey: string) {
  const res = await fetch(`${OMDB}?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`OMDb ${res.status}`);
  const data = (await res.json()) as {
    Response?: string;
    imdbRating?: string;
    imdbVotes?: string;
    Metascore?: string;
    Ratings?: Array<{ Source?: string; Value?: string }>;
  };
  // OMDb answers 200 with Response:"False" for an id it does not know.
  if (data.Response === "False") return null;
  const rt = data.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value;
  return {
    imdb_rating: num(data.imdbRating),
    imdb_votes: num(data.imdbVotes),
    rt_score: num(rt),
    metascore: num(data.Metascore),
  };
}

/**
 * Billed cast with the character each plays.
 *
 * A second TMDB call, but only for films we are already resolving artwork for,
 * and only for the first CAST_LIMIT entries — `order` is TMDB's own billing
 * order, so slicing it keeps the people an audience recognises.
 */
async function tmdbCast(tmdbId: number, apiKey: string) {
  const { query, headers } = tmdbAuth(apiKey);
  const res = await fetch(`${TMDB_MOVIE}/${tmdbId}/credits?${query.replace(/^&/, "")}`, {
    headers,
  });
  if (!res.ok) throw new Error(`TMDB credits ${res.status}`);
  const data = (await res.json()) as {
    cast?: Array<{
      name?: string;
      character?: string;
      order?: number;
      profile_path?: string | null;
    }>;
  };
  const cast = (data.cast ?? [])
    .filter((c) => typeof c.name === "string" && c.name.trim())
    .slice(0, CAST_LIMIT)
    .map((c) => ({
      name: c.name!.trim(),
      character: typeof c.character === "string" && c.character.trim() ? c.character.trim() : null,
      // Sized here rather than in the component: w185 is roughly 3x the 56px
      // circle it lands in, which covers a 3x display and nothing beyond. The
      // path is null for most of the regional catalogue, and the row is built
      // to look deliberate when it is.
      profile:
        typeof c.profile_path === "string" && c.profile_path.startsWith("/")
          ? `${TMDB_PROFILE}${c.profile_path}`
          : null,
    }));
  return cast.length > 0 ? cast : null;
}

async function tmdbArt(imdbId: string, apiKey: string): Promise<TmdbArt> {
  const { query, headers } = tmdbAuth(apiKey);
  const url = `${TMDB_FIND}/${encodeURIComponent(imdbId)}?external_source=imdb_id${query}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = (await res.json()) as {
    movie_results?: Array<{
      id?: number;
      poster_path?: string | null;
      backdrop_path?: string | null;
      genre_ids?: number[];
    }>;
  };
  const hit = data.movie_results?.[0];
  const poster = hit?.poster_path;
  const tmdbId = typeof hit?.id === "number" ? hit.id : null;
  const genreIds = Array.isArray(hit?.genre_ids) ? hit.genre_ids : [];
  // Taken from the same response rather than a second call: this endpoint has
  // always returned the backdrop, it was simply never read.
  const backdrop = hit?.backdrop_path;
  return {
    tmdbId,
    genreIds,
    poster:
      typeof poster === "string" && poster.startsWith("/") ? `${TMDB_IMAGE}${poster}` : null,
    backdrop:
      typeof backdrop === "string" && backdrop.startsWith("/")
        ? `${TMDB_BACKDROP}${backdrop}`
        : null,
  };
}

async function run(request: Request) {
  const SUPABASE_URL =
    import.meta.env?.["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const SUPABASE_KEY =
    import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"];
  const INGEST_TOKEN = process.env["SCRAPER_INGEST_TOKEN"];
  const TMDB_API_KEY = process.env["TMDB_API_KEY"];
  // Optional. Without it artwork and cast still resolve; only the critic
  // scores are skipped, and the response says so rather than failing quietly.
  const OMDB_API_KEY = process.env["OMDB_API_KEY"];

  if (!SUPABASE_URL || !SUPABASE_KEY || !INGEST_TOKEN) {
    return Response.json(
      { ok: false, error: "Supabase config or SCRAPER_INGEST_TOKEN missing" },
      { status: 500 },
    );
  }
  if (!TMDB_API_KEY) {
    // Deliberately not an error: the site still has posters, just borrowed ones.
    return Response.json({
      ok: true,
      skipped: "TMDB_API_KEY not configured — posters stay hotlinked",
    });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 60) || 60));

  // No imdb_id filter. It used to require the column to be set, which excluded
  // 400 of 501 live rows whose id is sitting in the poster filename.
  const { data: rows, error } = await db
    .from("cinema_films")
    .select("imdb_id, poster_url, backdrop_url, imdb_rating, cast_credits")
    .eq("is_active", true);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Distinct ids only — the same film appears once per chain and city.
  const pending: string[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const poster = (row.poster_url as string | null) ?? "";
    const backdrop = (row.backdrop_url as string | null) ?? "";
    const id = imdbIdFor(row as { imdb_id?: string | null; poster_url?: string | null });
    if (!id || seen.has(id)) continue;
    // Done only when BOTH are ours. Skipping on the poster alone would strand
    // every film that already has a TMDB poster and no backdrop — which is the
    // exact state of the rows resolved before backdrops existed.
    //
    // Metadata is part of "done" now: every row resolved before ratings existed
    // has its artwork and none of the rest, so an artwork-only test would skip
    // the entire back catalogue forever.
    const hasArt = poster.startsWith(TMDB_IMAGE) && backdrop;
    const hasMeta =
      (row as { imdb_rating?: number | null }).imdb_rating !== null ||
      (row as { cast_credits?: unknown }).cast_credits !== null;
    if (hasArt && hasMeta) continue;
    seen.add(id);
    pending.push(id);
    if (pending.length >= limit) break;
  }

  const genreNames = await tmdbGenreMap(TMDB_API_KEY);

  const startedAt = Date.now();
  const resolved: Array<{ imdb_id: string; poster_url: string; backdrop_url: string | null }> =
    [];
  const meta: FilmMeta[] = [];
  let withBackdrop = 0;
  let notFound = 0;
  let failed = 0;
  let rated = 0;
  let withCast = 0;
  let withGenres = 0;
  let omdbFailed = 0;

  for (const imdbId of pending) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    try {
      const art = await tmdbArt(imdbId, TMDB_API_KEY);
      if (art.poster) {
        resolved.push({ imdb_id: imdbId, poster_url: art.poster, backdrop_url: art.backdrop });
        if (art.backdrop) withBackdrop += 1;
      } else notFound += 1;

      /**
       * Ratings and cast, each allowed to fail on its own.
       *
       * Wrapped separately from the artwork above because they are separate
       * services: OMDb being down or out of quota must not cost us the poster
       * we already fetched, and a film with no TMDB credits should still get
       * its IMDb score. Anything that comes back null is left alone by
       * set_film_meta's coalesce, so a partial pass never erases a full one.
       */
      let ratings: Awaited<ReturnType<typeof omdbRatings>> = null;
      if (OMDB_API_KEY) {
        try {
          ratings = await omdbRatings(imdbId, OMDB_API_KEY);
          if (ratings?.imdb_rating !== null && ratings?.imdb_rating !== undefined) rated += 1;
        } catch {
          omdbFailed += 1;
        }
        await sleep(REQUEST_DELAY_MS);
      }

      let cast: Awaited<ReturnType<typeof tmdbCast>> = null;
      if (art.tmdbId !== null) {
        try {
          cast = await tmdbCast(art.tmdbId, TMDB_API_KEY);
          if (cast) withCast += 1;
        } catch {
          // Credits are the least important of the three; a miss retries next run.
        }
        await sleep(REQUEST_DELAY_MS);
      }

      // Names for the ids the find call already returned. Empty when the map
      // could not be fetched, which coalesce then leaves alone.
      const genres = art.genreIds
        .map((id) => genreNames.get(id))
        .filter((name): name is string => Boolean(name));
      if (genres.length > 0) withGenres += 1;

      if (ratings || cast || genres.length > 0) {
        meta.push({
          imdb_id: imdbId,
          imdb_rating: ratings?.imdb_rating ?? null,
          imdb_votes: ratings?.imdb_votes ?? null,
          rt_score: ratings?.rt_score ?? null,
          metascore: ratings?.metascore ?? null,
          cast_credits: cast,
          tmdb_genres: genres.length > 0 ? genres : null,
        });
      }
    } catch {
      // A single lookup failing must not sink the pass; it retries next run.
      failed += 1;
    }
    await sleep(REQUEST_DELAY_MS);
  }

  let updated = 0;
  if (resolved.length > 0) {
    const { data: result, error: rpcError } = await db.rpc("set_posters", {
      p_token: INGEST_TOKEN,
      p_map: resolved,
    });
    if (rpcError) {
      return Response.json({ ok: false, error: rpcError.message }, { status: 500 });
    }
    updated = Number((result as { updated?: number })?.updated ?? 0);
  }

  let metaUpdated = 0;
  if (meta.length > 0) {
    // A separate call from set_posters, and a separate function: that one's
    // body lives only in the database, so extending it would mean rewriting
    // from memory code nobody has a copy of.
    const { data: metaResult, error: metaError } = await db.rpc("set_film_meta", {
      p_token: INGEST_TOKEN,
      p_map: meta,
    });
    if (metaError) {
      return Response.json(
        { ok: false, error: metaError.message, stage: "set_film_meta" },
        { status: 500 },
      );
    }
    metaUpdated = Number((metaResult as { updated?: number })?.updated ?? 0);
  }

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    candidates: pending.length,
    resolved: resolved.length,
    notFoundOnTmdb: notFound,
    lookupsFailed: failed,
    rowsUpdated: updated,
    ratingsFound: rated,
    castFound: withCast,
    genresFound: withGenres,
    genreMapSize: genreNames.size,
    omdbFailures: omdbFailed,
    omdbConfigured: Boolean(OMDB_API_KEY),
    metaRowsUpdated: metaUpdated,
    backdropsFound: withBackdrop,
  });
}

export const Route = createFileRoute("/api/public/hooks/resolve-posters")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
