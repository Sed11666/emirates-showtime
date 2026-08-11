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

const BUDGET_MS = 40_000;
const REQUEST_DELAY_MS = 120; // TMDB allows ~50 req/s; nowhere near it.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tmdbPoster(imdbId: string, apiKey: string): Promise<string | null> {
  const url = `${TMDB_FIND}/${encodeURIComponent(imdbId)}?external_source=imdb_id&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = (await res.json()) as {
    movie_results?: Array<{ poster_path?: string | null }>;
  };
  const path = data.movie_results?.[0]?.poster_path;
  return typeof path === "string" && path.startsWith("/") ? `${TMDB_IMAGE}${path}` : null;
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

  const { data: rows, error } = await db
    .from("cinema_films")
    .select("imdb_id, poster_url")
    .eq("is_active", true)
    .not("imdb_id", "is", null);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Distinct ids only — the same film appears once per chain and city.
  const pending: string[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const id = row.imdb_id as string | null;
    const poster = (row.poster_url as string | null) ?? "";
    if (!id || seen.has(id)) continue;
    if (poster.startsWith(TMDB_IMAGE)) continue; // already ours
    seen.add(id);
    pending.push(id);
    if (pending.length >= limit) break;
  }

  const startedAt = Date.now();
  const resolved: Array<{ imdb_id: string; poster_url: string }> = [];
  let notFound = 0;
  let failed = 0;

  for (const imdbId of pending) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    try {
      const poster = await tmdbPoster(imdbId, TMDB_API_KEY);
      if (poster) resolved.push({ imdb_id: imdbId, poster_url: poster });
      else notFound += 1;
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
