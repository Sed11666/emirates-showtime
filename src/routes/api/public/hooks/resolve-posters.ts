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

type TmdbArt = { poster: string | null; backdrop: string | null };

async function tmdbArt(imdbId: string, apiKey: string): Promise<TmdbArt> {
  const { query, headers } = tmdbAuth(apiKey);
  const url = `${TMDB_FIND}/${encodeURIComponent(imdbId)}?external_source=imdb_id${query}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = (await res.json()) as {
    movie_results?: Array<{ poster_path?: string | null; backdrop_path?: string | null }>;
  };
  const hit = data.movie_results?.[0];
  const poster = hit?.poster_path;
  // Taken from the same response rather than a second call: this endpoint has
  // always returned the backdrop, it was simply never read.
  const backdrop = hit?.backdrop_path;
  return {
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
    .select("imdb_id, poster_url, backdrop_url")
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
    if (poster.startsWith(TMDB_IMAGE) && backdrop) continue;
    seen.add(id);
    pending.push(id);
    if (pending.length >= limit) break;
  }

  const startedAt = Date.now();
  const resolved: Array<{ imdb_id: string; poster_url: string; backdrop_url: string | null }> =
    [];
  let withBackdrop = 0;
  let notFound = 0;
  let failed = 0;

  for (const imdbId of pending) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    try {
      const art = await tmdbArt(imdbId, TMDB_API_KEY);
      if (art.poster) {
        resolved.push({ imdb_id: imdbId, poster_url: art.poster, backdrop_url: art.backdrop });
        if (art.backdrop) withBackdrop += 1;
      } else notFound += 1;
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

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    candidates: pending.length,
    resolved: resolved.length,
    notFoundOnTmdb: notFound,
    lookupsFailed: failed,
    rowsUpdated: updated,
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
