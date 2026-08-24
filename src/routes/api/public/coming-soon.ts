/**
 * GET /api/public/coming-soon — upcoming UAE releases.
 *
 * Server-side on purpose. The browser must never fetch cinemauae directly:
 * it would hand our visitors' traffic to the aggregator we source from, and
 * CORS would block it anyway.
 *
 * Cached in memory for an hour. Release dates move a few times a month, the
 * source page is ~11KB, and a serverless instance serves many requests, so this
 * turns a per-visit fetch into roughly one per instance per hour. The cache is
 * per-instance and vanishes on cold start, which is fine — a miss costs one
 * fetch, not correctness.
 *
 * Stale-on-error is deliberate: if cinemauae is down or changes its markup,
 * serving yesterday's release list beats serving an empty page, because these
 * dates are weeks out and do not go stale in an afternoon.
 */
import { createFileRoute } from "@tanstack/react-router";

import { parseComingSoon, type ComingSoonFilm } from "@/lib/coming-soon";

const SOURCE = "https://cinemauae.com/movies-coming-soon";
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

let cache: { at: number; films: ComingSoonFilm[] } | null = null;

async function load(): Promise<{ films: ComingSoonFilm[]; stale: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) return { films: cache.films, stale: false };

  try {
    const res = await fetch(SOURCE, {
      headers: { accept: "text/html", "user-agent": "ShowSouk/1.0 (+https://www.showsouk.com)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`source ${res.status}`);
    const films = parseComingSoon(await res.text());
    // An empty parse means their markup moved. Keep whatever we had rather than
    // replacing a good list with nothing.
    if (films.length === 0 && cache) return { films: cache.films, stale: true };
    cache = { at: Date.now(), films };
    return { films, stale: false };
  } catch {
    if (cache) return { films: cache.films, stale: true };
    return { films: [], stale: true };
  }
}

export const Route = createFileRoute("/api/public/coming-soon")({
  server: {
    handlers: {
      GET: async () => {
        const { films, stale } = await load();
        return Response.json(
          { ok: true, count: films.length, stale, films },
          {
            headers: {
              // Let Vercel's edge hold it too, and keep serving while it revalidates.
              "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
            },
          },
        );
      },
    },
  },
});
