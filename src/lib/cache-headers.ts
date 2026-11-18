/**
 * CDN caching for the public browse pages.
 *
 * Vercel's CDN keeps a page for 5 minutes (s-maxage) and, for 10 minutes after
 * that, keeps serving the cached copy while it rebuilds one in the background
 * (stale-while-revalidate). Browsers are told max-age=0, so they always ask
 * the CDN and never hold an old copy themselves. Measured before this: every
 * request rebuilt the page, 0.3-1 s each after the move to bom1.
 *
 * Why caching is safe here — and the rule that keeps it safe:
 *   Every server render is identical for every visitor. Sign-in, the avatar,
 *   "Add listing" and the chosen city all live in the browser (localStorage and
 *   the Supabase client), and no loader reads cookies or request headers.
 *   ANY page that starts rendering visitor-specific content on the server must
 *   not use this helper, or one visitor's page will be served to another.
 *
 * Never cached:
 *   - a page with no films. If the database hiccups and a loader returns an
 *     empty list, caching would show "Showtimes are updating…" to everyone for
 *     minutes. Uncached, the next visit simply tries again.
 *   - errors and 404s: the loader throws, so loaderData is undefined.
 *   - /admin, /auth, /search and the /api routes, which do not call this.
 *
 * Freshness: the scraper writes every 30 minutes, so a 5-minute copy is at most
 * one cycle behind and usually current. Pages with a client query (home,
 * /cinemas, film pages) also refetch after hydration. Each deployment has its
 * own cache, so a push is visible immediately.
 */
export const PUBLIC_PAGE_CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

export function browsePageHeaders(
  films: readonly unknown[] | null | undefined,
): Record<string, string> | undefined {
  if (!films || films.length === 0) return undefined;
  return { "Cache-Control": PUBLIC_PAGE_CACHE_CONTROL };
}
