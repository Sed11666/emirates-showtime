/**
 * /sitemap.xml — generated from the live catalogue on each request.
 *
 * The filename is `sitemap[.]xml.ts` because TanStack Router treats a dot as a
 * path separator: `sitemap.xml.ts` would serve `/sitemap/xml`. The brackets
 * escape it.
 *
 * Only URLs that are indexable and carry real content are listed. A sitemap
 * pointing at empty pages is worse than no sitemap — it spends crawl budget
 * teaching Google that the site is thin.
 *
 * Deliberately excluded:
 *   /auth, /admin        private, and /admin is RLS-gated anyway
 *   /coming-soon         redirects to /cinemas?view=upcoming
 *   /cinemas?view=...    canonical points at /cinemas, so listing it would
 *                        contradict the canonical
 *   /movies              legacy route kept only so old links resolve
 *   /search, /listing/$id  utility and admin-authored, not landing pages
 *   /events              a placeholder with no content yet
 */
import { createFileRoute } from "@tanstack/react-router";

// The URL list lives in lib/seo-audit.ts so this route and the admin SEO
// auditor can never disagree about what counts as a landing page.
import { SITE_ORIGIN, allTargets } from "@/lib/seo-audit";

const ORIGIN = SITE_ORIGIN;

/** XML text nodes must escape these five, and slugs can carry an ampersand. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(path: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${xmlEscape(ORIGIN + path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function build(): Promise<string> {
  const now = new Date().toISOString();

  // allTargets() already falls back to the static tiers when the catalogue
  // read fails, so a database hiccup still yields a valid sitemap rather than
  // a 500 that Search Console records as a fetch error.
  const { targets } = await allTargets();
  const entries = targets.map((t) => urlEntry(t.path, now, t.changefreq, t.priority));


  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const xml = await build();
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            // Films change daily, the schedule hourly. An hour at the edge keeps
            // this cheap without letting a new release wait a day to be listed.
            "cache-control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
