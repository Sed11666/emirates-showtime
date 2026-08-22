# ShowSouk — Architecture Guide

ShowSouk is a BookMyShow-style entertainment discovery platform for the UAE.
It aggregates **real, scraped** cinema showtimes across seven chains (VOX, Reel,
Novo, Roxy, Star, Cine Royal, Cinema City) plus arena events, lets visitors find
the nearest cinema, and deep-links each showtime to that exact screening on the
chain's own booking page. There is no in-app checkout or cart.

Production: **https://www.showsouk.com**, hosted on **Vercel**, auto-deployed
from GitHub `main`.

See [CLAUDE-HANDOVER.md](./CLAUDE-HANDOVER.md) for onboarding context, hosting
history and the incident log behind several rules below.

---

## 1. Stack

| Concern       | Choice                                                              |
| ------------- | ------------------------------------------------------------------- |
| Framework     | TanStack Start v1 (React 19, SSR) on Vite 8                          |
| Routing       | TanStack Router, file-based under `src/routes/`                      |
| Data fetching | TanStack Query                                                       |
| Styling       | Tailwind CSS v4 via `src/styles.css` (`@theme` tokens), shadcn/ui    |
| Backend       | Supabase: Postgres + Auth + RLS + pg_cron + pg_net                   |
| Scraping      | Plain `fetch` + regex against server-rendered HTML. No API key.      |
| Hosting       | Vercel (site **and** the scraper route)                              |

Do not introduce react-router-dom, a `src/pages` directory or an `App.tsx` page
switcher; routing is TanStack file-based and `src/routeTree.gen.ts` is
generated (never edit it). TypeScript is strict — unused imports fail the build.

---

## 2. Data flow

```text
 cinemauae.com (server-rendered aggregator)        arena sites
          |  plain fetch + regex + schema.org JSON-LD      |
          v                                                v
 /api/public/hooks/scrape-aggregator      /api/public/hooks/scrape-events
          |  RPC ingest_cinema_films(token, rows)          |
          v                                                v
   cinema_films (Postgres)                          live_events (Postgres)
          |                                                |
          v  lib/cinemas.ts                                v  lib/live-events.ts
   merge by title, group by day/venue, drop started screenings
          |
          v
   Routes: / (home)  /cinemas  /movie/$slug  /search
          |
          v  time chip click
   the chain's own booking page (exact screening where available)
```

Scheduling: `pg_cron` posts to the public scrape routes. Cinemas every 30
minutes, walking the sitemap via a cursor in `scraper_cursor` (45 pages a fire,
~85 minutes for a full pass). Events roughly every 6 hours.

`scrape-cinemas.ts` still exists but is **disabled and unscheduled**. It used
Firecrawl's LLM extraction, which fabricated plausible-looking VOX session ids
so every booking link 404'd. Do not re-enable it without reading §6.

---

## 3. Directory map

```text
src/
  routes/
    __root.tsx                providers, global head, site chrome, <Outlet/>
    index.tsx                 "/"  home: hero slider + Now Showing grid only
    cinemas.tsx               "/cinemas" browse by chain/city/day + near-me
    movie.$slug.tsx           "/movie/$slug" showtime picker, nearest-first
    events.tsx                "/events" Coming Soon placeholder
    search.tsx                "/search?q=" grouped results
    listing.$id.tsx           "/listing/$id" admin-authored entry detail
    admin.tsx                 "/admin" admin-only listing manager
    auth.tsx                  "/auth" customer sign in / sign up
    api/public/hooks/
      scrape-aggregator.ts    LIVE cinema scraper (cron target)
      scrape-events.ts        arena events scraper (cron target)
      scrape-cinemas.ts       legacy Firecrawl scraper, disabled
  lib/
    cinemas.ts                read layer + de-dup + showtime grouping
    showtimes.ts              venue blocks, distance sort, booking-URL fallback
    days.ts                   Dubai day keys, timeToMinutes, isScreeningOver
    venues.ts                 static UAE venue geo directory + Haversine
    search.ts                 internal-only search across our own tables
    listings.ts               curated `listings` CRUD helpers
  hooks/                      useAuth, useIsAdmin, useUserLocation
  components/
    site-chrome.tsx           header + footer
    movie-poster-card.tsx     poster tile; routes to /cinemas, never to booking
    ui/                       shadcn primitives (do not restyle ad hoc)
  integrations/supabase/      GENERATED — never edit
supabase/migrations/          SQL history
```

---

## 4. Database

All tables in `public`, RLS enabled.

- **cinema_films** — one row per `(cinema, title_key, city)`, which is a UNIQUE
  constraint and the upsert conflict target. `showtimes` is JSONB
  `[{date, time, venue, format, booking_url}]`. `is_active` marks currently
  showing. Metadata: `poster_url`, `imdb_id`, `genre`, `language`, `rating`,
  `duration_mins`, `synopsis`.
- **live_events** — one row per (source, event) from the arena scrapers.
- **scraper_auth** — the ingest token. RLS on with **no policies**, so PostgREST
  can never read it; only SECURITY DEFINER functions can.
- **scraper_cursor** — sitemap walk position.
- **scraper_page_cache** — per-URL `etag`, `last_modified`, `content_hash`,
  `film_keys[]`, `fetched_at`.
- **listings** — manually curated entries from `/admin`.
- **user_roles** — `(user_id, role)`. Roles live here, **never** on a profile row.

### Writing scraped data

Lovable Cloud never exposes the Supabase service-role key, so the scraper
authenticates with the public publishable key **plus an ingest token** and
writes through `SECURITY DEFINER` functions:

- `ingest_cinema_films(p_token, p_rows)` — the only write path for scraped films
- `page_cache_get(p_token, p_urls)` / `page_cache_put(p_token, p_rows)`
- `touch_films(p_token, p_keys)` — refresh `last_seen_at` on an unchanged page
- `retire_stale_films(p_chains)` — deactivate after 48h, **capped at 30% per chain**

Scraped content is read-only to the app; only `listings` is written from the
client, and only by admins.

---

## 5. Key domain rules (easy to get wrong)

1. **Everything is Asia/Dubai.** Day keys are `yyyy-mm-dd` from `toDayKey()`.
   Dubai is UTC+4 year-round; there is no DST to handle.
2. **One card per movie.** `mergeFilmsByTitle()`; a title must never appear once
   per chain. `titleKey()` normalises `&`→"and" and strips `[...]`/`(...)`
   language suffixes — it exists in three places that must stay in sync.
3. **Screenings vanish 30 minutes after they start** — `isScreeningOver()`.
4. **Formats are surfaced on the poster** (2D/3D/IMAX/4DX); the card is
   chain-agnostic.
5. **Nearest-first ordering** everywhere venues are listed.
6. **Booking links** resolve per-screening URL → film `booking_url` → chain home.
   Never construct a booking URL by hand, and never let one point at the
   aggregator we scraped from.
7. **The homepage is discovery only** — no showtimes, no booking. Every movie
   card routes to `/cinemas`.
8. **Search is internal only.** No external movie database, ever.
9. **Scrapers must be non-destructive**: a failed pass merges with the previous
   result rather than blanking rows.
10. **Admin gating is server-enforced.** `useIsAdmin` is cosmetic; RLS is the
    real boundary.

---

## 6. Scraper invariants — do not violate

Each of these cost a production incident.

- **Any rule that deactivates rows must be capped.** Retirement has nearly
  emptied the catalogue three times. `retire_stale_films` caps at 30% per chain.
- **Skipping a write must never skip `last_seen_at`.** If a cached page lets you
  skip the upsert, you must still `touch_films`, or retirement deletes healthy
  films 48 hours later. Cache entries without `film_keys` are therefore treated
  as a cache miss.
- **Cache entries must be from the current Dubai day.** Screenings are stamped
  with the day they were scraped; a stale entry answering `304` freezes those
  dates indefinitely.
- **Rolled minutes are for sorting, not elapsed time.** `timeToMinutes` pushes
  past-midnight shows past 1440. Comparing that against a rolled clock hides the
  entire coming day between midnight and 5am. Use real epoch instants.
- **Never use LLM extraction for values that must be exact.** It invents
  correctly-shaped URLs that do not resolve.
- **An empty batch is not a failure.** Only ~46 of 132 sitemap pages are
  currently-showing films.
- **`pg_cron` reports dispatch, not outcome.** Query `net._http_response` for
  real HTTP results.

---

## 7. Conventions

- Colours, gradients and shadows come from semantic tokens in `src/styles.css`
  (theatre purple-black base, marquee gold accent). Never hardcode
  `text-white`, `bg-black` or hex utilities in components.
- Every content route defines its own `head()` with a unique title/description
  and og tags; `__root.tsx` holds defaults only. Do not set a site-wide
  canonical or `og:url` there — it would claim every page is the homepage.
- Server-only logic uses server routes; anything under `/api/public/*` bypasses
  site auth, so validate input inside the handler.
- Generated files that must not be edited: `src/routeTree.gen.ts`,
  `src/integrations/supabase/*`, `.env`.

---

## 8. Running locally

```sh
npm i
npm run dev        # http://localhost:8080
npm run build      # production build
```

Supabase URL and publishable key come from the committed `.env`, so the app runs
against live data with no extra setup. `SCRAPER_INGEST_TOKEN` is only needed to
run the scraper route locally; it lives in the Vercel environment.

---

## 9. Where to start for common tasks

| Task                              | Start here                                        |
| --------------------------------- | ------------------------------------------------- |
| Add a cinema chain                | `scrape-aggregator.ts` CHAIN_KEYS + `lib/venues.ts`|
| Change the home grid              | `routes/index.tsx`                                 |
| Change the movie detail page      | `routes/movie.$slug.tsx` + `lib/showtimes.ts`      |
| Fix a wrong/missing time          | `lib/cinemas.ts` then the scraper                  |
| Change how long a show stays up   | `SHOWTIME_GRACE_MINUTES` in `lib/days.ts`          |
| Re-enable the Events page         | `routes/events.tsx` (data layer already live)      |
| Theme / colours                   | `src/styles.css`                                   |
| Permissions                       | `supabase/migrations/*` RLS + `hooks/useIsAdmin`   |
| Diagnose the pipeline             | `net._http_response`, then `scraper_page_cache`    |
