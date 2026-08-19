# ShowSouk — project handover

Paste this whole file as your first message to Claude on the new machine, or save
it as `CLAUDE-HANDOVER.md` in the repo root and tell Claude to read it.

---

## 1. What this is

**ShowSouk** — a BookMyShow-style cinema showtime aggregator for the UAE.
Live at **https://www.showsouk.com**.

Users browse films currently showing across UAE cinema chains, see showtimes by
venue and city, and click a showtime to go **directly to that exact screening's
booking page on the cinema's own site**. We never sell tickets; there is no cart
or checkout. We are a discovery and hand-off layer.

Owner: Syed Ebaad (`syedebaad609@gmail.com`, GitHub `Sed11666`).

---

## 2. Where everything lives

| Thing | Where | Notes |
|---|---|---|
| Website | **Vercel**, project `emirates-showtime`, team `showsouk` | auto-deploys from GitHub `main` |
| Domain | **GoDaddy** DNS → Vercel | `A @ → 216.198.79.1`, `CNAME www → 2ac6d918bd63059a.vercel-dns-017.com` |
| Canonical URL | `https://www.showsouk.com` | apex 308-redirects to `www` |
| Code | GitHub **`Sed11666/emirates-showtime`** (public) | this is the whole app |
| Database + Auth | **Supabase** (provisioned via Lovable Cloud), project ref `wrytmjudhqiyivzadwib` | |
| Lovable project | `9236f6c6-9e4f-4f96-8288-cbb769f606b6`, workspace `3403e9b503afc266681f` | **out of credits — do not rely on it** |

There is a second repo, **`Sed11666/ShowSouk`** (public) — an earlier standalone
Reel scraper on GitHub Pages. It is **not used by the live site**. Ignore it
unless you deliberately revisit it.

### Important hosting history
The site used to run on Lovable hosting. It was migrated to Vercel. The Lovable
**published deployment is frozen on an old build** and cannot be updated (no
credits), so:
- Never point anything at `*.lovable.app` expecting current code.
- The only live code path is GitHub `main` → Vercel.
- One exception: the **events** cron still calls the frozen Lovable deployment.
  Cinemas do not.

---

## 3. Tech stack

- **TanStack Start v1** (React 19, SSR) on **Vite 7**
- **TanStack Router**, file-based under `src/routes/`. `src/routeTree.gen.ts` is
  generated — never edit it.
- **TanStack Query** for data fetching
- **Tailwind CSS v4** via `src/styles.css` (`@theme` tokens) + **shadcn/ui**
- **Supabase**: Postgres + Auth + RLS + `pg_cron` + `pg_net`
- **TypeScript**, strict. Unused imports fail the build — clean them up.

Do **not** introduce `react-router-dom`, a `src/pages/` directory, or an
`App.tsx` page switcher. Routing is TanStack file-based.

---

## 4. How the data pipeline works

```
cinemauae.com  (third-party UAE showtime aggregator, server-rendered HTML)
      │  plain fetch + regex parse, no API key, no browser
      ▼
/api/public/hooks/scrape-aggregator      ← runs on Vercel
      │  RPC ingest_cinema_films(token, rows)
      ▼
Supabase  public.cinema_films
      │
      ▼
showsouk.com  (SSR reads the same DB)
      │  time chip click
      ▼
the chain's own booking page (VOX / Star / Cinemacity / …)
```

**Trigger:** Supabase `pg_cron` job `scrape-aggregator-30m`, every 30 minutes.
It advances a cursor in `public.scraper_cursor` (45 pages per fire) and POSTs to
`https://www.showsouk.com/api/public/hooks/scrape-aggregator?offset=<pos>`.

A full sitemap pass takes ~85 minutes. Only ~46 of the 132 pages in
cinemauae's sitemap are currently-showing films; the rest are coming-soon
titles with no screenings, so most passes legitimately write nothing.

### Why we scrape an aggregator rather than the chains
This was a deliberate, informed decision by the owner. Measured comparison:

| | scraping chains directly (old Firecrawl approach) | cinemauae |
|---|---|---|
| chains | 4 | **8** |
| venues | 21 | **52+** |
| emirates | ~5 | **8** |
| films | 33 | **300+** |
| per-screening booking links | fabricated / broken | **100% of bookable shows** |

The plan is to move to direct chain scraping or partner feeds at scale. The
parser is deliberately isolated in one file so that swap doesn't touch anything
else.

**Known risk:** they can change their markup or block us, and we'd lose all
seven chains at once. Accepted knowingly.

---

## 5. Database

Project ref `wrytmjudhqiyivzadwib`. All tables in `public`, RLS enabled.

### Tables
- **`cinema_films`** — one row per `(cinema, title_key, city)`. That triple is a
  UNIQUE constraint and the upsert conflict target. `showtimes` is JSONB:
  `[{date, time, venue, format, booking_url}]`. `is_active` marks currently
  showing. Also `poster_url`, `genre`, `language`, `rating`, `duration_mins`,
  `synopsis`, `imdb_id`, `booking_url`, `source_url`, `venues[]`, `formats[]`.
- **`live_events`** — arena events (Etihad Arena, Coca-Cola Arena).
- **`scraper_auth`** — single row holding the ingest token. RLS on, **no
  policies**, so PostgREST can never read it.
- **`scraper_cursor`** — sitemap walk position (`pos`, `step`, `total`).
- **`scraper_page_cache`** — per-URL `etag`, `last_modified`, `content_hash`,
  `film_keys[]`, `fetched_at`.
- **`listings`** — manually curated entries from `/admin`.
- **`user_roles`** — `(user_id, role)`. Roles live here, never on a profile row.
- `cinema_scrape_runs` / `event_scrape_runs` — audit logs.

### Functions (all `SECURITY DEFINER`, all take the ingest token)
- `ingest_cinema_films(p_token text, p_rows jsonb)` — the only write path for
  scraped films. Strips competitor URLs at the boundary, coalesces metadata so a
  thin page can't blank good values, then calls `retire_stale_films`.
- `page_cache_get(p_token text, p_urls text[])` → url, etag, last_modified,
  content_hash, film_keys, fetched_at
- `page_cache_put(p_token text, p_rows jsonb)`
- `touch_films(p_token text, p_keys jsonb)` — refreshes `last_seen_at` for films
  whose page was unchanged
- `retire_stale_films(p_chains text[])` — deactivates films untouched for 48h,
  **capped at 30% of a chain per pass**

### Cron
```
scrape-aggregator-30m   */30 * * * *   → showsouk.com (Vercel)   cinemas
scrape-events-6h        15 */6 * * *   → lovable.app (frozen)    events
```
Note `pg_cron` reports "succeeded" when `pg_net` *dispatches* the request — it
never sees the HTTP result. **To check real outcomes, query `net._http_response`.**

---

## 6. Secrets — where they live, what you need

Nothing secret is in the repo. `.env` is committed but only holds the Supabase
URL and the **publishable** key, which ship in the browser bundle by design.

| Secret | Lives in | How to get it |
|---|---|---|
| `SCRAPER_INGEST_TOKEN` | Vercel env var | `select token from scraper_auth;` in Lovable Cloud → SQL editor |
| GitHub PAT | your machine only | create a fine-grained token, repo `emirates-showtime`, **Contents: Read and write** |
| Supabase service_role | **not available** | Lovable Cloud hides it — that's why the RPC pattern exists |
| `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY` | Lovable secrets | legacy, no longer used by the live pipeline |

**Never** put the service_role key or the ingest token in the repo, and never
put a secret in a `VITE_`-prefixed variable — those get bundled into the browser.

---

## 7. Setting up the new machine

```bash
winget install Git.Git
winget install OpenJS.NodeJS.LTS
```

```bash
git clone https://github.com/Sed11666/emirates-showtime.git
cd emirates-showtime
npm install
npm run dev        # http://localhost:8080
```

For Claude to commit on your behalf, create a fine-grained GitHub token
(repo `emirates-showtime`, Contents: Read and write) and save it to a file —
**don't paste it into chat**, it ends up in the transcript.

Local dev reads Supabase from the committed `.env`, so the app will run and show
live data with no extra setup. You only need `SCRAPER_INGEST_TOKEN` locally if
you want to run the scraper route.

---

## 8. Hard-won gotchas — read this section

These cost real incidents. Do not relearn them.

**1. Retirement logic has nearly emptied the catalogue three times.**
Any rule that deactivates rows must be capped. `retire_stale_films` caps at 30%
per chain. If you touch retirement, treat it as high-risk.

**2. Skipping a write must never skip `last_seen_at`.**
The page cache lets us skip upserts for unchanged pages. If you skip the write
you *must* still call `touch_films`, or the 48h retirement deletes healthy
films two days later. That's why cache entries without `film_keys` are treated
as a cache miss.

**3. Cache entries must be same-day.**
Screenings are stamped with the day they were scraped. A cache entry from
yesterday must not be allowed to answer `304`, or the board silently serves
yesterday's dates forever. `fetched_at` day is compared against Dubai today.

**4. Rolled minutes are for sorting, not elapsed time.**
`timeToMinutes` pushes past-midnight shows past 1440 so they sort at the end of
their evening. Never compare that against a rolled clock — between midnight and
5am it makes the whole coming day look finished. Use real epoch instants
(`isScreeningOver` in `src/lib/days.ts`). Dubai is UTC+4 year-round, no DST.

**5. LLM extraction fabricates URLs.**
The previous Firecrawl scraper invented plausible VOX session ids
(`/booking/0039-139303`) that 404'd — every VOX booking link on the site was
dead for weeks. The current scraper copies `href`s literally. Don't reintroduce
LLM extraction for anything that must be exact.

**6. Never send users to cinemauae.**
`lib/showtimes.ts` resolves a booking target as
`film.booking_url ?? film.source_url`. Both must point at a chain. The
`ingest_cinema_films` function strips `cinemauae`/`aptrixx` URLs at the DB
boundary as a backstop.

**7. An empty batch is not a failure.**
Most sitemap pages are coming-soon films with no screenings. Only treat a run as
failed if it couldn't read anything.

**8. Vercel bot protection will block `pg_net`.**
It was returning `429 Vercel Security Checkpoint` for hours. Bot protection is
currently **disabled** for this project. If cron mysteriously stops, check that
first, and check `net._http_response`.

**9. Everything is Asia/Dubai.** Day keys are `yyyy-mm-dd` in Dubai time.

**10. One card per movie.** `mergeFilmsByTitle()` de-dupes across chains.
`titleKey()` normalises `&`→"and", strips `[...]`/`(...)` and language suffixes.
It exists in **three places** that must stay in sync: the aggregator, the
cinemas scraper, and `src/lib/cinemas.ts`.

---

## 9. Product rules

- Homepage is **discovery only** — no showtimes, no booking. Every movie card
  routes to `/cinemas`. A "Today's Showtimes" board was deliberately removed.
- Screenings disappear **30 minutes after they start**.
- Booking links resolve: per-screening URL → film booking_url → chain home.
  Never construct a booking URL by hand.
- Nearest-first ordering wherever venues are listed.
- Search is internal only — never an external movie database.
- Admin gating is server-enforced via RLS; `useIsAdmin` is cosmetic only.

---

## 10. Current state

```
7 chains: vox, star, novo, roxy, reel, cineroyal, cinemacity
~300 active films · ~2,800 screenings · ~2,600 with booking links
100% of films have posters, genre, language, rating, runtime, synopsis
8 emirates, 60+ venues
```

Per-screening (exact show) booking links work for **VOX, Star, Cinemacity**.
**Novo and Cine Royal** only reach the film's page. For **Cine Royal that is
permanent** — their booking carries the screening in session state, not in a
URL, so no per-show link exists to find (see §11.1). Novo is still open.
Reel's booking sits behind a sign-in wall.

Latest commits:
```
0fb1d84 Compare screenings on real instants, not rolled minutes
10cabbb An empty page batch is not a failure
d9a81b6 Never trust a cache entry from a previous day
a5abcf8 Include the scrape day in the content hash
cf17443 Hide screenings 30 minutes after they start
ca60ffa Remove the Today Showtimes board from the homepage
f5fac72 Homepage movie cards route to Cinemas, not to booking
```

---

## 11. Outstanding work

1. **Cine Royal deep links — CLOSED 2026-08-19: not possible. Do not reopen.**
   The earlier note here assumed `prettyUrlId` was a per-screening id. It is not
   — it is the *film* slug, byte-identical for every showtime of that film, and
   `showId` comes back as `0`. Verified against their live API.

   Their booking flow carries the chosen screening in **server-side session
   state, never in a URL**. `proceedToSeatSelection(show)` POSTs the whole show
   object to `addUserDataToSession`, and only then calls
   `loadSteatingLayout(obj.prettyUrlId)`, which is just
   `document.location.href = "/home/chooseSeats/" + filmSlug`.

   Three independent confirmations, all reproducible:
   - `POST /home/getShowTimesByFilmAndShowDate` (body
     `{prettyUrl, showdate: "DD-MMM-YYYY", cinemaRefId, filmName, screenType}`)
     works fine server-side and returns every screening — but each carries the
     same `prettyUrlId` and `showId: 0`. There is no per-show identifier.
   - `GET /home/chooseSeats/{slug}` with no session **302s to `/home`**, so it
     is not a linkable destination even at film level.
   - The app reads **no URL parameters at all** — no `$location.search()`, no
     `$routeParams`, no `URLSearchParams`. Nothing can be passed in by link.

   There is no URL we can construct that lands a user on a specific screening,
   because Cine Royal's own site does not have one. The current film-level
   `/home/chooseScreen/{slug}` link is already the best target that exists.
   This is a ceiling in their product, not a gap in our parser.

   Still genuinely available from that endpoint, if we ever want it: real screen
   metadata per screening — `screenType` (STANDARD / ROYAL KIDS / ROYAL CLASS),
   `screen` (e.g. CINEMA 4), `availableSeats`, and `showTime` as a true UTC
   instant. We currently store `format: "Regular"` for every Cine Royal
   screening because that is all cinemauae gives us. Useful, but it is showtime
   enrichment, not deep linking.

   Venue → `cinemaRefId`: Khalidiyah Mall 2, Dalma Mall 101, Al Dhannah Mall
   200, Deerfields Mall 300, WTC Mall Abu Dhabi 10000001.
2. **Novo deep links** — harder. Next.js, ships no session ids server-side.
   Booking is a JS click handler. Would need their `backend.novocinemas.com` API.
3. **TMDB posters** — posters currently hotlink `cinema.aptrixx.com`. Filenames
   are IMDb ids (`tt22084616.jpg`) and `cinema_films.imdb_id` is populated, so
   own artwork can be resolved via TMDB with a free API key.
4. **`/cinemas` copy** still says "the scraper runs automatically every three
   hours" — it's every 30 minutes now.
5. **Poster `alt` attributes are empty** — accessibility gap; the title is available.
6. **Events pipeline still depends on the frozen Lovable deployment.** If that
   ever goes away, events stop refreshing. Cinemas are already independent.
7. **165 screenings still dated 11 Aug** from films whose pages no longer carry
   showtimes — the 48h retirement should clear them.
8. **Revoke the old GitHub token** that was pasted into the previous chat.

---

## 12. How to verify things are healthy

```sql
-- real HTTP outcomes (cron only reports dispatch, not result)
select status_code, created, left(content, 200)
from net._http_response order by created desc limit 5;

-- data freshness and coverage
select s->>'date' as day, count(*) screenings,
       count(*) filter (where s->>'booking_url' is not null) with_link
from cinema_films f, jsonb_array_elements(f.showtimes) s
where f.is_active group by 1 order by 1;
```

```bash
# trigger a scrape manually
curl -sS -X POST "https://www.showsouk.com/api/public/hooks/scrape-aggregator?offset=0" \
  -H "Content-Type: application/json" -d '{}'
```

A healthy response looks like:
`{"ok":true,"visited":47,"notModified":30,"filmsKeptAlive":240,"ingest":{"upserted":45}}`
