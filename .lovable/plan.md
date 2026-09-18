# Admin SEO health dashboard

A new admin-only page that checks every ShowSouk landing page and keeps a
history, so you can see at a glance whether pages are loading, whether their
titles/descriptions are complete, and whether they are all in the sitemap.

## What you'll see

A new "SEO health" tab inside the admin area (`/admin/seo`), visible only to
admins:

- **Overall score card** — pages healthy vs. broken, last check time, and a
  "Run check now" button.
- **Trend chart** — health score and broken-page count over the last 30 runs,
  so a regression after a deploy is obvious.
- **Problem list** — every page with an issue, grouped by type: bad status
  code, missing/duplicate title, missing or too-short description, missing or
  wrong canonical, missing structured data, missing from sitemap.
- **All pages table** — every landing page with its status code, title length,
  description length, canonical, structured-data types found, and whether it
  is listed in the sitemap. Sortable and filterable by page tier (home,
  chain, venue, emirate, language, film, legal).

## How it works

An audit run walks the same URL list the sitemap builds from, requests each
page, and records what it finds. Runs happen on a schedule (daily) and on
demand from the dashboard button. Each run is stored, so history accumulates
and nothing is recomputed on page load.

## Technical detail

**Database** (one migration, with GRANTs and RLS):

- `seo_audit_runs` — `id`, `started_at`, `finished_at`, `status`,
  `pages_checked`, `pages_failing`, `score`, `sitemap_url_count`, `notes`.
- `seo_page_checks` — `run_id` (FK, cascade), `path`, `tier`, `status_code`,
  `response_ms`, `title`, `title_len`, `description`, `description_len`,
  `canonical`, `canonical_ok`, `h1_count`, `jsonld_types text[]`,
  `in_sitemap`, `issues text[]`.
- RLS: SELECT for `authenticated` only where `has_role(auth.uid(),'admin')`;
  writes restricted to the audit function's token path (same
  `SECURITY DEFINER` + ingest-token pattern the scrapers already use, via a
  new `ingest_seo_audit(p_token, p_run, p_rows)`). No `anon` grants.

**Audit endpoint** — `src/routes/api/public/hooks/seo-audit.ts`
(`/api/public/hooks/seo-audit`, token-guarded inside the handler, same shape
as the existing scraper hooks). It:

1. Builds the URL list by reusing the sitemap's own source data
   (`CINEMAS`, `VENUES`, `CITY_BY_SLUG`, `LANGUAGE_SLUGS`, film slugs from
   `fetchCinemaFilms`) — extracted into `src/lib/seo-audit.ts` so the sitemap
   route and the auditor cannot drift apart.
2. Fetches `https://www.showsouk.com/sitemap.xml` and parses `<loc>` values.
3. Fetches each page in small concurrent batches with a per-request timeout,
   parses `<title>`, `meta[name=description]`, `link[rel=canonical]`,
   `<h1>` count and `application/ld+json` `@type` values by regex (same
   approach the aggregator scraper uses — no DOM library).
4. Derives `issues[]` per page (status not 200, title missing or outside
   15–65 chars, description missing or outside 70–160, canonical missing or
   not self-referencing, no JSON-LD, h1 count ≠ 1, not in sitemap), computes
   a score, and writes run + rows through the RPC.

**Dashboard route** — `src/routes/admin.seo.tsx`, admin-gated with
`useIsAdmin` (UI) plus RLS (real boundary). Reads the latest run and the last
30 runs via TanStack Query; trend chart uses the existing `recharts` shadcn
chart primitives; styling stays on the emerald/gold tokens. "Run check now"
posts to the audit endpoint and refetches. Route carries `noindex` and stays
out of the sitemap, like `/admin`.

**Scheduling** — `pg_cron` job posting to the audit hook once daily
(cinema scrapers already own the 15-minute slot; a crawl of ~140 pages is a
daily job).
