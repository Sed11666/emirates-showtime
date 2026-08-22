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

**The hand-off is deliberately ungated.** A sign-in wall was added in front of
booking (`3fe7866`) and removed three days later (`877f38b`): it sat between the
visitor and something they could reach by typing "vox cinemas" into Google, and
since the chain asks them to sign in again anyway it bought a first-time visitor
two accounts and nothing else. Showtime chips go straight out. **Do not
reintroduce it** — the reasoning is in `877f38b` and it was a considered reversal,
not an oversight.

An account is asked for exactly once, for **Notify Me**, which genuinely cannot
work anonymously. That lives in `notify_subscribers`.

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

- **TanStack Start v1** (React 19, SSR) on **Vite 8**
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
- **`notify_subscribers`** — one row per signed-in user who asked to be told
  when events launch (`877f38b`). RLS on, policies scoped to `auth.uid()` with
  **no cross-row SELECT**, so the list cannot be harvested with the public key.
  **Missing from `src/integrations/supabase/types.ts`** — see §11.12.
- **`user_roles`** — `(user_id, role)`. Roles live here, never on a profile row.
- `cinema_scrape_runs` / `event_scrape_runs` — audit logs.

### Functions (all `SECURITY DEFINER`; all take the ingest token **except one**)
- `ingest_cinema_films(p_token text, p_rows jsonb)` — the only write path for
  scraped films. Strips competitor URLs at the boundary, coalesces metadata so a
  thin page can't blank good values, then calls `retire_stale_films`.
- `page_cache_get(p_token text, p_urls text[])` → url, etag, last_modified,
  content_hash, film_keys, fetched_at
- `page_cache_put(p_token text, p_rows jsonb)`
- `touch_films(p_token text, p_keys jsonb)` — refreshes `last_seen_at` for films
  whose page was unchanged
- `retire_stale_films(p_chains text[])` — deactivates films untouched for 48h,
  **capped at 30% of a chain per pass**. **Takes no token, and is therefore
  callable by anyone holding the publishable key — see §11.2.** Called internally
  by `ingest_cinema_films`; never called directly from `src/`.
- `set_posters(p_token text, p_map jsonb)` — swaps hotlinked artwork for
  `image.tmdb.org` URLs, keyed on `imdb_id`. Written by the `resolve-posters`
  route. Over-reports its updated count (§11.11).

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
  routes to `/cinemas`, scoped to that film. A "Today's Showtimes" board was
  deliberately removed.
- **Booking happens on `/cinemas`, not on `/movie/$slug`.** Chips link straight
  out to the chain (`040ea7c`). `/movie/$slug` still exists and still works, but
  **nothing links to it** — treat it as orphaned, not as the booking path.
- **The click-out is never gated** (`877f38b`, reversing `3fe7866`). Sign-in is
  asked for only where it is genuinely required — Notify Me. The
  `AuthPromptProvider` machinery (`components/auth-prompt.tsx`, renamed from
  `booking-gate`) is kept on purpose: it is what stops an OAuth round-trip
  stranding someone once a provider is actually configured.
- **A film with no screening still to come must not appear anywhere**
  (`5379abe`). `is_active` only means the scraper still sees the film; it says
  nothing about whether anything is left to watch today. Home, search and
  `/cinemas` all share `hasUpcomingScreenings` in `lib/cinemas` so a title leaves
  every surface at the same instant.
- **Pass `isScreeningOver` a bare clock time, never a display string**
  (`7e6307b`). `parseShowtimes` returns `text` as a composite (`Venue - date -
  time`); feeding that in makes `timeToMinutes` return `MAX_SAFE_INTEGER`, which
  the guard reads as "not finished yet", so the filter silently passes
  everything. It put 54 cards on the home page when 32 films qualified.
- Screenings disappear **30 minutes after they start**.
- Booking links resolve: per-screening URL → film `booking_url` → chain home.
  Never construct a booking URL by hand.
- **A link only counts as exact when exactly one screening of that film uses
  it** (`7170f89`). Having a URL is not the same as having a URL to *your*
  screening. Chips that cannot reach a single screening render dashed and muted
  and say so; the same rule drives the film-level fallback and the legend, so
  all three agree.
- **Never let a film-level fallback be one of that film's own screening URLs**
  (`2aaccc5`, `4c0143b`). Doing so sent six VOX chips to one session: an 18:45
  Platinum and a 20:45 Standard opened the same seat map, and someone following
  that books the wrong showing. Dropping to the chain site is the lesser harm.
- **Formats are canonicalised on write** (`f6e2ab3`, `ce8edcb`): Title Case with
  brands preserved (MAX, IMAX, not Imax), and Regular / Standard / bare `2D`
  merged into one `Standard`. Synonyms match the whole value, never a substring,
  so `Suites 2D` and `Dolby 2D` keep their meaning. Do not re-apply CSS
  uppercase to format chips — it hides the canonicalisation.
- Nearest-first ordering wherever venues are listed. Venue matching is
  **name-based**, so a screen missing from `lib/venues.ts` silently shows no
  distance and sorts last.
- Search is internal only — never an external movie database.
- Admin gating is server-enforced via RLS; `useIsAdmin` is cosmetic only.

---

## 10. Current state

Measured against the live database on **2026-08-22**. These move daily; re-run
the queries in §12 rather than trusting the numbers.

```
7 chains: vox, star, novo, roxy, reel, cineroyal, cinemacity
444 active film rows · 58 distinct titles · 3,439 screenings · 2,989 with a link
8 cities · 63 distinct screen names (64 in the geo list)
posters: 44 of 444 rows on image.tmdb.org; 152 rows carry an imdb_id
```

**Read that poster line as a symptom.** 152 rows are eligible and only 44 are
resolved, because `resolve-posters` has never been scheduled (§11.3): a manual
run resolves everything eligible, then each scrape adds hotlinked rows and the
ratio decays. It read 152 of 442 on 22 Aug and 44 of 444 a day later.

**Per-screening booking links now work for five of seven chains** — Novo and
Roxy both publish real session URLs, which the older note here denied.

| chain | screenings | with a link | exact (unique to one screening) |
|---|---|---|---|
| vox | 1541 | 1398 | 1398 |
| star | 609 | 572 | 572 |
| roxy | 276 | 264 | 264 |
| cinemacity | 258 | 255 | 255 |
| novo | 227 | 221 | 221 |
| cineroyal | 302 | 279 | **4** |
| reel | 226 | 0 | 0 |

**Cine Royal** is film-level only and permanently so (§11.1): its 285 linked
screenings share just 31 URLs. The 4 counted "exact" are films with a single
screening, where the film URL is unique by accident — not partial success.
**Reel** publishes no booking URLs at all; its booking sits behind a sign-in wall.

**Poster caveat:** only 152 of 442 rows carry an `imdb_id`, and `resolve-posters`
can only act on rows that have one. Every eligible row is resolved; the other
**290 have no id and are permanently unreachable by that route**. The old claim
that "100% of films have posters, genre, language, rating, runtime, synopsis" is
true about *having* a poster and misleading about *owning* it.

Latest commits:
```
e9b8bf9 Take venue coordinates from the source that names the venues
33fdd40 Fix wrong cinema distances: stale location and bad coordinates
dd25fb0 Make the Cinemas filters dropdowns
877f38b Stop gating the click-out, ask for an account for alerts instead
7e6307b Pass the clock time, not the display string, to isScreeningOver
5379abe Drop films with nothing left to see from home and search
8a1a1b2 Hide Google sign-in until it has credentials
4c0143b Stop storing a session URL as a film-level booking link
```

Venue coordinates are now taken from each screen's own page on cinemauae, the
same record the venue names come from, so identity always matches and no
geocoding guesswork is involved: **63 of 64 exact** (`e9b8bf9`). Only Reel
Springs Souk has no page there.

Interleaved with those are several commits named only `Changes` or `Work in
progress` — those are Lovable editor syncs, not deliberate checkpoints.

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
2. **`retire_stale_films` is callable by anyone — still open, highest risk.**
   Every other scraper RPC rejects a bad token with `42501`. This one takes no
   token and returns `200` to a caller holding only the publishable key, which
   ships in the browser bundle by design. It is the function that deactivates
   catalogue rows — the same mechanism that has nearly emptied the catalogue
   three times (§8.1). The 48h and 30%-per-chain guards limit a single call, but
   repeated calls compound, and a stalled scraper makes far more rows eligible.

   Fix is a `REVOKE`, **not** a rewrite: nothing in `src/` calls it directly, and
   it runs only from inside `ingest_cinema_films`, which is SECURITY DEFINER, so
   that internal call executes as the owner and is unaffected. Revoke from
   `public, anon, authenticated` — Postgres grants EXECUTE to PUBLIC by default,
   so revoking the two Supabase roles alone achieves nothing. Do not rewrite the
   body; it exists nowhere in this repo and nobody has read it.

3. **`resolve-posters` is not scheduled.** It has only ever been run by hand, so
   films scraped since the last manual run arrive hotlinked and stay that way.
   A daily `pg_cron` job is enough — the route skips already-resolved films, so
   steady-state runs do almost nothing. Note the route runs its job on **GET as
   well as POST**, so a casual health check triggers real work.

4. **Google sign-in is blocked structurally, and is currently hidden.**
   `/auth/v1/authorize?provider=google` returns
   `400 {"msg":"Unsupported provider: missing OAuth secret"}`: the provider is
   switched on with no client credentials attached.

   **This is not a misconfiguration anyone can correct from a dashboard.** The
   database lives in Lovable's Supabase organisation, Lovable Cloud brokers
   Google through its own OAuth app, and it exposes no Client ID or Client
   Secret fields — so there is nowhere to put credentials even after creating a
   Google client (`8a1a1b2`). Do not send someone to "Supabase → Providers →
   Google"; that screen is not reachable for this project.

   `/auth/v1/settings` reports `google: true` whether or not credentials exist,
   so the runtime capability probe **cannot** detect this. Hence the documented
   constant `GOOGLE_LACKS_CREDENTIALS` in `hooks/useAuthProviders.tsx`, which
   hides the button. Set it `false` the moment the project has its own
   credentials and the button returns by itself — the sign-in path already talks
   to Supabase directly rather than through the Lovable wrapper.

   Escaping this needs the project moved to its own Supabase organisation. Email
   and password are unaffected.

   Still true and still latent: once credentials exist, `redirectTo` is
   `window.location.href`, so the allowlist needs **wildcards**
   (`https://www.showsouk.com/**`), not one exact URL. An unlisted `redirectTo`
   does not error — Supabase silently substitutes the Site URL.

5. **Events pipeline still depends on the frozen Lovable deployment.** If that
   ever goes away, events stop refreshing. Cinemas are already independent, and
   since `3f92e8d` this is the *only* remaining Lovable runtime dependency.

6. **Google Search Console work is mid-flight.** `1d77b36` and `47ccdc4` start a
   GSC connection; the surrounding `Changes` / `Work in progress` commits are
   Lovable syncs. Check what actually landed before building on it.

7. **Phone auth is built and wired but hidden.** Which sign-in methods appear is
   read at runtime from Supabase settings, so enabling phone auth with an SMS
   provider makes the Mobile tab appear with **no redeploy** (`3fe7866`).

8. **Reel and Cine Royal will never get exact links.** Reel publishes none; Cine
   Royal cannot (§11.1). Do not spend time here — the honesty markers from
   `696fe64` are the answer, not a better parser.

9. **Revoke the old GitHub token** that was pasted into a previous chat.

10. **Migrations cannot rebuild the database.** None of `ingest_cinema_films`,
    `page_cache_get`, `page_cache_put`, `touch_films`, `retire_stale_films` or
    `set_posters` appear in `supabase/migrations/` — all six were created through
    the Lovable Cloud SQL editor and exist only in the live database. Their
    *signatures* are in `src/integrations/supabase/types.ts`, so the repo does
    record that they exist; what it has nowhere is their **bodies**, so none of
    them could be recreated from this repository. Verified by probing each live.

11. **`set_posters` over-reports.** It returned `rowsUpdated: 286` on a run where
    exactly 184 rows changed, and again `114` where 114 changed but only after a
    differing count. Data outcomes are correct; the number is not. Likely counts
    matched rather than modified rows. Unverifiable without service-role access.

12. **`npm run build` does not typecheck, and `tsc` currently fails.** The build
    script is `vite build`, which strips types without checking them, so Vercel
    deploys green while `npx tsc --noEmit` reports **4 errors**:

    - `routes/index.tsx` 80, 98, 99 — `notify_subscribers` is missing from the
      generated `src/integrations/supabase/types.ts`, so the table resolves to
      `never`. The table exists in the live database; the types file is stale and
      must be **regenerated, never hand-edited**.
    - `routes/movie.$slug.tsx:228` — `onClick={requestPrecise}` hands React's
      `MouseEvent` to a function whose first parameter is `onSuccess`, so a
      successful fix calls the event object as a function and throws
      `TypeError`. Coordinates are set first, so the damage is limited, and
      `/movie/$slug` is orphaned. Fix is `onClick={() => requestPrecise()}`.

    Worth adding `tsc --noEmit` to CI: the one thing this repo's strictness is
    supposed to buy is currently not being collected.

### Closed since this list was written

- ~~**Novo deep links**~~ — **done.** Novo now publishes real per-screening
  session URLs (`uae.novocinemas.com/seat-selection/cinema/9/session/342071`):
  189 screenings, 189 distinct URLs. Roxy gained them too.
- ~~**TMDB posters**~~ — **done, with a ceiling.** Every row that has an
  `imdb_id` is resolved; 290 rows have none and never can be. See §10.
- ~~**`/cinemas` copy says "every three hours"**~~ — fixed, then the whole header
  was rewritten for visitors rather than for us (`3559c4c`).
- ~~**Poster `alt` attributes empty**~~ — already fixed before it was noticed.
- ~~**165 screenings dated 11 Aug**~~ — cleared by retirement as expected.

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
