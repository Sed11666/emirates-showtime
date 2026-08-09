# ShowSouk — Architecture Guide

ShowSouk is a BookMyShow-style entertainment discovery platform for the UAE.
It aggregates **real, scraped** cinema showtimes from VOX, Reel, Novo and Roxy
(plus arena events), lets visitors find the nearest cinema, and deep-links each
showtime to the chain's own booking page. There is no in-app checkout or cart.

Production: https://showsouk.com (published via Lovable).

---

## 1. Stack

| Concern        | Choice                                                             |
| -------------- | ------------------------------------------------------------------ |
| Framework      | TanStack Start v1 (React 19, SSR) on Vite 7                        |
| Routing        | TanStack Router, file-based under `src/routes/`                    |
| Data fetching  | TanStack Query                                                     |
| Styling        | Tailwind CSS v4 via `src/styles.css` (`@theme` tokens), shadcn/ui  |
| Backend        | Lovable Cloud (Supabase): Postgres + Auth + RLS + pg_cron          |
| Scraping       | Firecrawl (schema-based extract), called from server routes        |
| Runtime        | Cloudflare Worker (edge) — no Node-only packages, no child_process |

Do not introduce react-router-dom, a `src/pages` directory or an `App.tsx`
page switcher; routing is TanStack file-based and `src/routeTree.gen.ts` is
generated (never edit it).

---

## 2. Data flow at a glance

```text
 Cinema chain sites            Arena sites
 (vox/reel/novo/roxy)     (etihad, coca-cola arena)
          |                          |
          v  Firecrawl extract       v
 /api/public/hooks/scrape-cinemas   /api/public/hooks/scrape-events
          |  upsert + deactivate stale + log run
          v                          v
   cinema_films (Postgres)      live_events (Postgres)
          |                          |
          v  lib/cinemas.ts          v  lib/live-events.ts
   merge by title, group by day/venue
          |
          v
   Routes: / (home)  /cinemas  /movie/$slug  /search
          |
          v  time chip click
   Official chain booking page (deep link)
```

Scheduling: pg_cron calls the public scrape routes — cinemas incrementally
every 3 hours plus a full refresh at 05:00 Dubai; events roughly every 6 hours.

---

## 3. Directory map

```text
src/
  routes/                     file-based routes (filename dots = URL slashes)
    __root.tsx                providers, global head, site chrome, <Outlet/>
    index.tsx                 "/"  home: hero slider, now showing, showtimes board
    cinemas.tsx               "/cinemas" browse by chain/city/day + near-me
    movie.$slug.tsx           "/movie/$slug" showtime picker, nearest-first
    events.tsx                "/events" Coming Soon placeholder (data still scraped)
    search.tsx                "/search?q=" grouped results
    listing.$id.tsx           "/listing/$id" admin-authored entry detail
    admin.tsx                 "/admin" admin-only listing manager
    auth.tsx                  "/auth" customer sign in / sign up
    movies.tsx                legacy route kept for old links (tab removed)
    api/public/hooks/
      scrape-cinemas.ts       cinema scraper (cron target)
      scrape-events.ts        arena events scraper (cron target)
  lib/
    cinemas.ts                read layer + de-dup + showtime grouping
    showtimes.ts              venue blocks, distance sort, booking-URL fallback
    venues.ts                 static UAE venue geo directory + Haversine
    days.ts                   Asia/Dubai day keys and day options
    search.ts                 internal-only search across our own tables
    listings.ts               curated `listings` CRUD helpers
    live-events.ts            read layer for scraped arena events
  hooks/
    useAuth.tsx               Supabase session
    useIsAdmin.tsx            role check against user_roles
    useUserLocation.tsx       geolocation w/ city fallback, cached
  components/
    site-chrome.tsx           header (logo + location | nav | search/account) + footer
    movie-poster-card.tsx     poster tile w/ format badges
    movie-marquee.tsx         infinite right-to-left poster slider
    search-overlay.tsx        header search dropdown
    day-selector.tsx, listing-card.tsx, poster-reel.tsx, reveal.tsx
    ui/                       shadcn primitives (do not restyle ad hoc)
  integrations/supabase/      GENERATED — never edit
  styles.css                  design tokens (theatre purple-black + marquee gold)
supabase/migrations/          SQL history (schema, RLS, grants, cron)
```

---

## 4. Database

All tables live in `public` with RLS enabled and explicit GRANTs.

- **cinema_films** — one row per (chain, film). `title_key` de-dups across
  chains, `showtimes` is JSONB (per venue, per day, per screening with
  `booking_url`), `formats`/`venues` are text arrays, `is_active` marks whether
  the film was seen in the latest run.
- **live_events** — one row per (source, event) from the arena scrapers.
- **cinema_scrape_runs / event_scrape_runs** — audit log per run: source URL,
  content hash, changed flag, upserted/deactivated counts, status, error.
- **listings** — manually curated movies/events created from `/admin`.
- **user_roles** — `(user_id, role)` with an `app_role` enum. Roles are stored
  here and **never** on a profile/user row. `has_role()` backs RLS policies.

Rule of thumb: scraped content is read-only to the app; only `listings` is
written from the client, and only by admins.

---

## 5. Key domain rules (easy to get wrong)

1. **Everything is Asia/Dubai time.** Day keys are `yyyy-mm-dd` produced by
   `toDayKey()`. Screenings after midnight (e.g. 01:15) sort at the end of the
   previous evening — see `timeToMinutes()`.
2. **One card per movie.** The home grid uses `mergeFilmsByTitle()`; a title
   must never appear once per chain. Chain/venue choice happens on
   `/movie/$slug`.
3. **Formats are surfaced on the poster** (2D / 3D / IMAX / 4DX) since the card
   is chain-agnostic.
4. **Nearest-first ordering** everywhere venues are listed, using
   `useUserLocation()` -> `distanceKm()`; fall back to the header city centre
   when geolocation is denied.
5. **Booking links** resolve in this order: per-screening URL -> venue film URL
   -> film source URL. Never construct a booking URL by hand.
6. **Search is internal only.** No external movie database, ever.
7. **Scrapers must be non-destructive**: a failed detail pass merges with the
   previous result rather than blanking existing rows.
8. **Admin gating is server-enforced.** UI hiding via `useIsAdmin` is cosmetic;
   RLS is the real boundary.

---

## 6. Conventions

- Colours, gradients and shadows come from semantic tokens in `src/styles.css`
  (theatre purple-black base, marquee gold accent). Never hardcode
  `text-white`, `bg-black` or hex utilities in components.
- Every content route defines its own `head()` with a unique title/description
  and og tags; `__root.tsx` holds defaults only.
- Server-only logic uses server routes / `createServerFn`; anything under
  `/api/public/*` bypasses site auth, so validate input inside the handler.
- Generated files that must not be edited: `src/routeTree.gen.ts`,
  `src/integrations/supabase/*`, `.env`.

---

## 7. Running locally

```sh
npm i
npm run dev        # http://localhost:8080
npm run build      # production build (edge target)
```

Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` for the
client; the Firecrawl key is a server-side secret read inside the scraper
handlers. Server secrets are only available at request time, never at module
scope.

---

## 8. Where to start for common tasks

| Task                              | Start here                                        |
| --------------------------------- | ------------------------------------------------- |
| Add a cinema chain                | `scrape-cinemas.ts` SOURCES + `lib/venues.ts`      |
| Change showtime board layout      | `routes/index.tsx`                                 |
| Change the movie detail page      | `routes/movie.$slug.tsx` + `lib/showtimes.ts`      |
| Fix a wrong/missing time          | `lib/cinemas.ts` (normalisation) then the scraper  |
| Re-enable the Events page         | `routes/events.tsx` (data layer already live)      |
| Theme / colours                   | `src/styles.css`                                   |
| Permissions                       | `supabase/migrations/*` RLS + `hooks/useIsAdmin`   |
