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

### Files worth knowing before you change anything

| File | Why it matters |
|---|---|
| `src/routes/api/public/hooks/scrape-aggregator.ts` | the scraper. All-or-nothing page writes, self-pacing, 3-day walk |
| `src/routes/api/public/hooks/resolve-posters.ts` | TMDB artwork — posters *and* backdrops |
| `src/lib/reel-films.ts` | Reel's own feed and the title matcher (§4b) |
| `src/lib/cinemas.ts` | the read layer. `titleKey`/`filmSlug` live here |
| `src/lib/venues.ts` | 64 screens with coordinates, `venueSlug`, `bookingTarget`, the UAE outline |
| `src/lib/search.ts` | site search. Results carry their own route + params |
| `src/components/venue-showtimes.tsx` | **the** showtime chip. Shared by five pages |
| `src/components/filter-row.tsx` | **the** filter dropdown. Shared by /cinemas and /movie |
| `src/components/theme-menu.tsx` | Appearance rows, shared by both header states |
| `src/styles.css` | both palettes and every effect token (§10c) |
| `scripts/*.mts` | read-only health checks (§12) |

The three shared components are shared **because their copies drifted before**.
A fix applied to one copy and not the others is how `/movie/$slug` ended up
silently missing the dashed honesty marker and the film-level fallback. If you
find yourself pasting a chip or a dropdown, import it instead.

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

**Three days, not one.** cinemauae publishes today, tomorrow and the day after
behind `?d=0|1|2` on each film page; `?d=3` falls back to `d=0`, so three is
their ceiling. Every day carries its own booking links — a `d=1` Roxy URL embeds
tomorrow's date — and tomorrow usually has *more* working links than today,
because a screening that has already started loses its href at source.

An earlier note in this file said cinemauae was today-only and multi-day was
impossible. That was wrong: it came from testing `?date=` and `?showdate=`,
guessing at parameter names instead of reading the day tabs that are in the
markup of every page we fetch. `SCRAPE_DAYS` in the aggregator and `DAY_COUNT`
in `lib/days` must stay in step.

**A page is written all-or-nothing — do not break this.**
`ingest_cinema_films` **replaces** a film's showtimes rather than merging, so a
write missing a day *deletes* that day. All three days are fetched together with
no conditional validators, one hash covers the lot, and nothing is written unless
every day was read. Two earlier variants each destroyed real data: a per-day
`304` meant that day was never parsed and the row was rebuilt without it, and a
budget check between days let a run write today alone over a row that already
held three. Budget is checked once per page, never between its days.

**Trigger:** `pg_cron` job `scrape-aggregator-15m`, every 15 minutes, a plain
`net.http_post` with **no `?offset=`**.

The route paces itself from the clock: `PAGES_PER_RUN` per `PACE_WINDOW_MS`
tick, wrapping on the live sitemap length. `PAGES_PER_RUN` must stay at or under
what a run measurably completes — 12, with three days per page — and
`PACE_WINDOW_MS` must match the cron interval. Overlap is harmless; only
overshoot loses pages. An explicit `?offset=` still wins for a manual run.

`public.scraper_cursor` is **inert**: nothing reads or writes it. It previously
held the cursor, and its `step` had to match how many pages a run completed —
a number that moved 45 → ~30 → 12 in a single afternoon as the scrape went from
one day to three. Each time it moved, a stale `step` skipped pages silently,
which is how a third of the catalogue ended up with no future showtimes. The
pacing constants now live beside the loop whose cost they describe.

A full pass is ~16 fires, roughly four hours. Only a minority of sitemap pages
are currently-showing films; the rest are coming-soon titles with no screenings,
and those cost one fetch rather than three because a page with nothing on `d=0`
skips the other two days.

The sitemap grows — 132 pages when this was written, 157 on 2026-08-24 — so read
`pagesTotal` out of the scraper's own response rather than trusting a number here.

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

## 4b. Reel comes from Reel (added 2026-08-28)

Reel is the one chain not sourced from cinemauae. `src/lib/reel-films.ts` reads
Reel's own public Vista feeds (§8.12) and the aggregator overrides Reel rows
with them at the end of a run.

**What it replaces:** showtimes, venues and screen types for a matched Reel row,
plus a film-level `booking_url` of the form
`reelcinemas.com/en-ae/movie-details/{filmId}/{slug}`. That URL shape is their
own — read out of their bundle, where `generateMovieDetailUrl` builds exactly
that.

**Film-level is the ceiling.** Their route table has no per-session route and
seat selection is in-app state. cinemaseats.net holds the session ids and still
redirects to the same film page. Do not reopen this expecting a per-showtime
deep link.

**Title matching is deliberately conservative** — a wrong id opens *another
film's* booking page, which is worse than the generic page we fall back to.
Exact match, then one title being a prefix of the other (`Khalifa` /
`Khalifa: The Bloodline`), then an edit or two for spelling drift (`Bethlahem` /
`Bethlehem`). Every rule needs a single unambiguous candidate and languages that
do not contradict — that last part is what keeps the three `Toxic` entries,
which are three separate film ids, apart. 27 of 31 rows match; the rest keep the
chain showtimes page.

**Three guards that must stay:**
- An empty or failed feed fetch changes nothing. A feed that cannot be read must
  never blank a chain.
- Showtimes are replaced only when the feed actually has screenings for that
  film in the window.
- Non-UAE Reel branches in the same feed (Granada Mall, Marassi Bahrain) are
  excluded by venue id, or they surface under a UAE city.

**Honest scoping:** at a 3-day window this is close to a wash on volume — the
feed gave 197 and 200 screenings for the next two days where cinemauae gave 202
and 201, the deficit being sessions Reel marks `AllowTicketSales:false`. The
feed carries **16 days**; the upside is all in days 4–16, which the site does
not show. What it does buy is a first-hand source, immediate removal of
withdrawn sessions, and real screen names (it fixed a live data fault where
`Platinum` and `Platinum Suites` were two labels for one product).

`npx tsx scripts/check-reel-feed.mts` prints stored-vs-feed counts per day.
`npx tsx scripts/check-reel-links.mts` prints deep-link coverage.

---

## 5. Database

Project ref `wrytmjudhqiyivzadwib`. All tables in `public`, RLS enabled.

### Tables
- **`cinema_films`** — one row per `(cinema, title_key, city)`. **Its only
  SELECT policy is `USING (is_active = true)`, so the publishable key can never
  see a retired row** — see gotcha 17 before concluding rows have vanished. That triple is a
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
scrape-aggregator-15m   */15 * * * *   → showsouk.com (Vercel)   cinemas
scrape-events-6h        15 */6 * * *   → lovable.app (frozen)    events
resolve-posters-daily   17 4 * * *     → showsouk.com (Vercel)   posters
```
The cinemas job is a plain `net.http_post` with **no query string**. It must not
pass `?offset=` and must not touch `scraper_cursor` — the route paces itself
(§4). A job that computed an offset was tried and failed silently for 40 minutes;
if writes stop, check `cron.job_run_details` before assuming the route is down.
Schedules are **UTC**, not Dubai, which is the one place in this project where
Dubai time is not the answer. `17 4` is 08:17 Dubai, and the `:17` is
deliberate: the aggregator now fires at `:00`, `:15`, `:30` and `:45`, so this
stays clear of all four.
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

**4. There is no "cinema day". A small-hours show belongs to the date it starts.**
`timeToMinutes` used to add 24 hours to anything before 05:00, on the belief
that a 2am chip was the tail of the previous evening. The source does not work
that way: each `?d=N` tab is one plain calendar day, 00:00–23:59, and a booking
link that carries its own date proves it — the 12:00 AM chip on the 27 Aug tab
links to `theroxycinemas.com/.../27+Aug+2026/00:00/`. cinemauae marks those
chips `time-chip-late` with a moon icon, but that is **decoration only** and
does not shift the date; do not take it as evidence of a rollover.

The rollover pushed a 02:00 show on today's board to 02:00 *tomorrow*, and a
screening dated in the future can never be over, so it was pinned to the board
permanently. On the morning of 26 Aug the board offered a 2am screening that
had played hours earlier and the chain answered "booking unavailable" — and
because everything genuinely later that day had also finished, it was often the
*only* chip left, so a venue read as though it had one dead show on it.
Reproduced against the live catalogue: 4 venue panels in that state at 09:00.

Both sort sites order an already day-filtered list, so plain minutes are right
there too. Keep elapsed time on real epoch instants (`isScreeningOver` in
`src/lib/days.ts`); Dubai is UTC+4 year-round, no DST.

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

**11. `jsonb_to_recordset` drops unknown keys silently. This has bitten twice.**
`ingest_cinema_films` declares an explicit column list. A key the scraper sends
that is not in that list is discarded with **no error anywhere** — the run
reports `ok:true` and the upsert count is unchanged.

- `imdb_id` was sent on every run for months and dropped every time. Only 13 of
  46 titles had an id, which starved `resolve-posters` (it matches on that
  column) down to ~3% of the catalogue. Nothing looked broken.
- `director`/`cast_names` would have done the same had the function not been
  updated in the same change.

**Before adding a field to the ingest payload, add it to the function.** Dump the
current definition first (`pg_get_functiondef`) and edit that — do not write one
from memory. The same applies to `set_posters`.

**12. Reel publishes its whole catalogue as public JSON. Do not trust the old
"401" note.** An earlier version of this file recorded Reel deep links as
impossible because `apiuae.reelcinemas.com` answers 401. That was the wrong
host. The site is a Vista front end and its data sits unauthenticated in Google
Cloud Storage:

```
https://storage.googleapis.com/eeg-prod-reelcinema-sb/web/vista/json/Films.json
https://storage.googleapis.com/eeg-prod-reelcinema-sb/web/vista/json/Sessions.json
https://storage.googleapis.com/eeg-prod-reelcinema-sb/web/vista/json/Cinemas.json
```

The generalisable lesson: **a note in this file is not evidence.** Re-check a
claim before building on it, especially one that says something is impossible.
This is the second time that has cost real work — the first was the Cine Royal
screen-metadata no-op in §11.1.

**13. A chain-filtered scrape must never write the page cache.**
`?chains=reel` applies its filter *before* `pageKeys` is collected, so a filtered
run would store the page's content hash next to only that chain's film keys. A
later full run then matches the hash, treats the page as unchanged, skips the
ingest and touches `last_seen_at` for one chain — leaving every other chain on
that page unrefreshed and, after 48h, retired. Guarded now: a filtered run
ignores the cache in both directions. Related to gotcha 2.

**14. The scrape offset comes from the clock, not a stored cursor.**
`autoOffset = floor(now / PACE_WINDOW_MS) * PAGES_PER_RUN`. Triggering the
endpoint repeatedly inside one 15-minute window re-walks the **same pages** —
hammering cinemauae for no extra coverage. Pass `?offset=` explicitly if you
need to move, or wait for the next tick.

**15. An alpha caps the contrast a colour can reach.**
On a near-white surface, `text-muted-foreground/70` measured 2.35:1 — and
darkening the token could not fix it, because *even pure black at 70% alpha
plateaus at 2.84:1*. If small text on a light ground fails contrast and it
carries an alpha, the alpha is the bug. Use a solid colour.

**16. A location outside the UAE must not be used for distances.**
`useUserLocation` only honours a granted fix if `withinServiceArea()` accepts it
— including a cached one, or someone who allowed location abroad keeps being
measured from there for the whole TTL. Outside, the visitor gets city-centre
ordering and the label says which city.

The test is **point-in-polygon against a coarse UAE outline**, and the two
simpler rules that look sufficient both measurably fail — do not "simplify" it
back:
- *Distance from the nearest screen:* Sohar in Oman is 92 km from a UAE cinema
  while Liwa, inside the UAE, is 153 km. No threshold separates them.
- *Bounding box:* the UAE reaches ~51.58°E and Doha sits at 51.53°E. That is a
  ~2 km margin of longitude — a rounding error away from calling Qatar local.

Border towns on the Omani side can fall inside the outline. That is the right
answer for what it decides: Buraimi is a few kilometres from Al Ain's screens and
those visitors really do drive to them.

**17. The publishable key cannot see retired rows, and that looks like data loss.**
`cinema_films` has exactly one SELECT policy:

```sql
CREATE POLICY "Active cinema films are publicly viewable"
ON public.cinema_films FOR SELECT USING (is_active = true);
```

So with the anon key, `?is_active=eq.false` returns **0** and an unfiltered count
returns only the active rows — whichever way you ask. Retirement is working
normally and the rows are still there; they are filtered out before your query
runs. This was misread once already as "retired rows are being deleted rather
than flagged", from exactly those two queries.

Auditing retirement needs service-role access, which is not available on a dev
machine. Until then, judge it by whether the *active* count and the stalest
rows look sane — and remember that a film whose last screening was yesterday
*should* be retired. That is the feature working.

**18. Posters are portrait; heroes are landscape.**
The hero was rendering `poster_url`: a 310×459 image upscaled ~6× into a
~1876×700 frame and cropped to a quarter of its height. The same file looks
sharp on the Now Showing cards because there it is *downscaled* 0.54×. If hero
artwork ever looks soft again, check which field it is reading before touching
any CSS — `backdrop_url` is the 16:9 one.

---

## 9. Product rules

- Homepage is **discovery only** — no showtimes, no booking. Every movie card
  routes to `/cinemas`, scoped to that film. A "Today's Showtimes" board was
  deliberately removed.
- **Booking happens on `/cinemas`, not on `/movie/$slug`.** Chips link straight
  out to the chain (`040ea7c`). `/movie/$slug` still exists and still works, but
  **nothing links to it** — treat it as orphaned, not as the booking path.
- **The board covers three days**, because that is what the source publishes
  (§4). `DAY_COUNT` drives the picker and must match `SCRAPE_DAYS`.
- **Never fall back to another day's times.** `showtimesForDay` and
  `showtimesByVenue` each used to return an unfiltered set when the chosen day
  had no matches, which rendered today's times — some already started — under a
  future date. Both are now strictly day-filtered: an empty day means empty, and
  saying so is the point.
- **`/coming-soon` is not in the database** (`9dd945f`). It is one cached fetch
  of cinemauae's coming-soon index, parsed server-side. Films there have a
  release date and nothing else; do not invent showtimes for them.
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
- Screenings disappear **30 minutes after they start**, judged against the
  calendar date they carry — a 00:30 show on the 27th is gone by 01:00 on the
  27th, and tonight's late show lives on tomorrow's tab because that is the day
  it starts. See §8.4; assuming a 5am "cinema day" here is what broke this.
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

Measured against the live database on **2026-08-28**. These move daily; re-run
the queries in §12 rather than trusting the numbers.

```
7 chains: vox, star, novo, roxy, reel, cineroyal, cinemacity
501 active film rows · 46 distinct titles · 9,548 screenings · 9,044 with a link
3 days: 28 Aug 3,040 · 29 Aug 3,210 · 30 Aug 3,129
8 cities · 63 distinct screen names (64 in the geo list)
artwork: 454 rows have a backdrop_url · 90 posters on image.tmdb.org
metadata: 487 rows carry an imdb_id · 446 a director · 489 a cast
reel: 27 of 31 rows deep-link to /movie-details
```

The imdb_id figure moved from 147 to 487 on 2026-08-28. That was not scraping —
the ids were already sitting in the poster filenames and nothing was reading
them (§8.11).

Screenings roughly doubled on 2026-08-24 when the scrape went from one day to
three. Coverage was still filling in when these were taken — a full pass is
about four hours — so the per-chain counts below are a floor, not a total.

**Posters read low here and that is expected mid-rotation.** Only rows carrying
an `imdb_id` can be resolved, and `resolve-posters-daily` runs once a day, so
after a large rescrape the ratio dips until the next run. A number that keeps
falling day over day means the cron has stopped; a dip after a rescrape does not.

**Per-screening booking links work for five of seven chains.** The "exact" column
counts URLs used by exactly one screening of that film, so it fell relative to
"with a link" once three days were stored — worth re-deriving rather than reading
as a regression.

| chain | screenings | with a link | exact (unique to one screening) |
|---|---|---|---|
| vox | 3200 | 2964 | 2124 |
| star | 1250 | 1211 | 933 |
| roxy | 790 | 786 | 508 |
| cineroyal | 700 | 695 | **4** |
| cinemacity | 689 | 680 | 444 |
| reel | 575 | **0** | 0 |
| novo | 433 | 432 | 324 |

**Cine Royal** is film-level only and permanently so (§11.1): its linked
screenings share a handful of URLs. The 4 counted "exact" are films with a single
screening, where the film URL is unique by accident — not partial success.

**Reel no longer comes from cinemauae at all — see §4b.** cinemauae emits
`booklink=0` on every Reel chip (the only chain it does that for), so Reel had
zero per-screening links and fell through to the chain URL. Since 2026-08-28
Reel's showtimes, venues, screen types and film-level booking links come from
Reel's own public feed instead, and 27 of 31 rows deep-link to the film's own
booking page.

The claim that used to sit here — that Reel's `/movie-details/{id}/{slug}` id was
unreachable because `apiuae.reelcinemas.com` answers 401 — **was wrong**, and it
was wrong in the expensive direction: it read as settled and stopped anyone
looking for months. That was the wrong host. See §8.12.

**Poster caveat:** only rows carrying an `imdb_id` can be resolved, and most do
not have one. Every eligible row gets resolved by `resolve-posters-daily`; the
rest are permanently unreachable by that route. The old claim that "100% of films
have posters, genre, language, rating, runtime, synopsis" is true about *having*
a poster and misleading about *owning* it.

Latest commits:
```
487172c Let the scraper pace itself instead of trusting a cursor
4288dfd Write a page's three days all at once, or not at all
e12e661 Scrape three days, and show them
9dd945f Add Coming Soon, so next week has an answer
8be6eef Stop offering days we have no schedule for
05e88aa Actually install Vercel Web Analytics
35f0edb Send Reel clicks to its showtimes page, not its front door
f9c5c9c Scope Cinemas near you to the chain being filtered
70e9d9a Carry the chain through when a home page tile opens Cinemas
321297e Give signed-in visitors an account menu, and a working theme mechanism
```

Venue coordinates are now taken from each screen's own page on cinemauae, the
same record the venue names come from, so identity always matches and no
geocoding guesswork is involved: **63 of 64 exact** (`e9b8bf9`). Only Reel
Springs Souk has no page there. The two `Marina Mall Cinema` rows are sourced
from Google Maps instead, because one source page cannot fill two venues sharing
a name — see the closed item in §11.

Interleaved with those are several commits named only `Changes` or `Work in
progress` — those are Lovable editor syncs, not deliberate checkpoints.

---

## 10b. SEO — how the site is meant to be found

Added 2026-08-25/26. Before it, the site had **8 pages, none of which
contained a film name or a showtime in the HTML**, no sitemap, and no
structured data. Everything was fetched after hydration, so search engines saw
an empty shell. It is now 116 URLs, all server-rendered.

### Everything is server-rendered. Keep it that way.
Each route loads its data in a TanStack **route loader**, not a client-only
`useQuery`, and seeds the query from it. If you add a page that lists films,
give it a loader — a page whose content arrives after hydration is invisible to
most crawlers and lags days behind on Googlebot's second pass, which is useless
for a board that changes hourly.

Loaders return a **trimmed projection**, not the full catalogue: a loader's
return value is serialised into the HTML, and the whole set is ~1.5MB. Today
only, minus fields the page does not render. The heavy read stays
server-to-Supabase. `initialDataUpdatedAt: 0` marks the seed stale so the
client immediately fetches the complete three days.

### The page tiers, and why each exists
| Tier | URL | Answers |
|---|---|---|
| Browse | `/cinemas` | "what's on" |
| Chain | `/cinemas/{chain}` | "vox cinemas showtimes" |
| Venue | `/cinemas/{chain}/{venue}` | "reel dubai mall showtimes" |
| City | `/movies-in/{city}` | "movies in dubai today" |
| Film | `/movie/{slug}` | "mutiny showtimes uae" |

**A query parameter cannot rank.** `/cinemas?cinema=vox` had the right data at a
URL with no title, description or canonical of its own — that is why the chain
tier exists rather than a filter.

**URL shapes are constrained by the router.** `/cinemas/dubai` collides with
`/cinemas/$chain`; `/cinemas/city/dubai` collides with the venue route, which
reads it as chain "city". Hence `/movies-in/{city}`. The chain and venue routes
use the trailing-underscore filenames (`cinemas_.$chain`,
`cinemas_.$chain_.$venue`) so neither `/cinemas` nor the chain page becomes a
layout wrapped around them.

**Unknown chain, venue, city or film throws `notFound`.** A soft 200 on a
nonsense URL is how a site teaches Google it is thin.

That sentence was in this file before it was true of `/movie/$slug`, which
returned 200 with an empty shell for any unmatched slug until 2026-08-29. It
mattered: source titles change — "El Gawahergy (Arabic)" became "El Gawahergy"
— and the old slug stays in Google's index. `/movie/el-gawahergy-arabic` was
serving the raw slug as its `<h1>` with no showtimes and had earned 14
impressions in that state. **If you add a tier, check the 404 rather than
assuming it, and check the status code, not the rendered page.**

### Internal linking is deliberate
home → chain tiles → chains → venues; footer → all eight cities → venues; every
listing → film pages. No tier depends on the sitemap alone: a page a crawler has
to be told about ranks worse than one it can walk to. If you add a tier, link it
from something.

### Sitemap
`/sitemap.xml` is a **server route generated per request** from the live
catalogue (`routes/sitemap[.]xml.ts`), not a static file. Static pages, seven
chains, 64 venues, eight cities, and one entry per film that still has a
screening to come — so the count drifts by a few daily as films finish their
runs, which is correct. `robots.txt` names it. Deliberately excluded, with
reasons in the file: auth, admin, the `/coming-soon` redirect,
`?view=upcoming` (its canonical points at `/cinemas`), legacy `/movies`, search,
listings and the empty `/events`.

The filename escapes the dot as `sitemap[.]xml.ts`; TanStack treats `.` as a
path separator, so `sitemap.xml.ts` would serve `/sitemap/xml`.

### Structured data
`lib/structured-data.ts`. One `@graph` per page so nodes reference each other by
`@id` — every `ScreeningEvent` points at the one `Movie` rather than restating
it. Film pages carry Movie + up to 80 ScreeningEvent + BreadcrumbList; venue
pages MovieTheater + BreadcrumbList; chain and city pages BreadcrumbList +
ItemList; the homepage Organization + WebSite.

**Only ever describe what the page renders.** The events use the same day filter
as the UI. Google treats markup for absent content as spam, and tying the two
together is what stops them drifting.

Cost is not a reason to trim it: 49KB raw on a film page is **2.7KB gzipped**,
because near-identical events compress away.

`ScreeningEvent` will not produce a Google showtimes box — those come from a
partner feed, not open markup. It is still correct and is what AI crawlers read.

### Canonicals
Absolute on every page, never relative. `og:url` likewise, since a relative
`og:url` is meaningless to a social crawler. The apex 308s to `www`, and every
canonical points at `www`.

### What the numbers actually say — measured 2026-08-29

Filtered to **Country = United Arab Emirates**, which is the only segment that
means anything here:

```
28 days (really ~3 — the property has data from 24 Aug)
  impressions 40   clicks 0   CTR 0%   average position 10.7
  impressions trending up, ~5/day to ~24/day
```

**Always segment by country before drawing a conclusion.** The unfiltered view
read 6 clicks, 161 impressions, 3.7% CTR, position 11 — and every one of those
clicks was the owner's family in India searching the brand name. Blended, the
CTR looked above par for the position and the listing looked healthy. Split by
country, the real market is 0% CTR, and the position average was being propped
up by branded searches that rank #1 because nothing else is called ShowSouk.

The queries are the right ones — no junk, all high-intent and local:

```
khalifa movie in dubai                      4
toy story 5 dubai                           2
toy story 5 sharjah                         1
toy story showtime                          1
where is toy story 5 playing near me        1
the end of oak street showtimes near dubai  1
toy story 5 novo cinemas                    1
```

Two things follow. **Indexing is not the problem** — a page cannot take an
impression unless it is indexed, and impressions land on venue *and* film *and*
home URLs, so all three tiers are in. Use that rather than waiting on the Page
Indexing report, which takes days to compute on a new property. **Position is
the whole problem**, and at 10.7 the site sits on the page-1 boundary rather
than buried, so relevance work is worth doing rather than hopeless.

### Titles and descriptions are generated, not fixed

Five of seven ranking queries name a city. The film page title said "in the
UAE" and named none, so the strongest term in the query appeared nowhere in the
tag. `titleTag()` and `descriptionTag()` in `movie.$slug.tsx` now build both
from the film's own rows.

Rules encoded there, each for a reason:

- **Cities ranked by screen count, capped at two** in the title. More reads as
  stuffing and pushes the film name out of the visible tag.
- **~60 character budget**, and when it does not fit **the brand is dropped
  before the city**. `| ShowSouk` earns nothing for a domain nobody searches
  for yet; the city is the term doing the work.
- **Only chains that actually have the film.** The description used to hardcode
  all seven, so Toy Story 5's page told Google it played at Roxy and Cine
  Royal. It does not.
- **158 character budget on the description.** The old text ran to 194 where
  Google renders ~155, so a fifth of it was never shown.

### Rejected: film x city pages

`[film] [city]` is the dominant query and `/movie/toy-story-5/dubai` is the
obvious response. **Do not build it.** 46 films across 8 emirates is 368
near-identical URLs funnelling to one showtime list, which is Google's own
definition of a doorway page; many would be thin (two showtimes in Ajman); and
it splits link equity a domain with no backlinks cannot spare. The single film
page already ranks 10.7 for those queries. Strengthen it, do not shard it.

### Search Console
Verified via a meta tag in `__root.tsx`. The property is a **domain property**
(`showsouk.com`), which covers apex and www together — so the sitemap is
submitted as the full URL, not a relative path. The **AMP report showing a red
icon is not an error**: the site has no AMP pages and never will.

---

## 10c. Theming — light mode (added 2026-08-28)

`:root` in `src/styles.css` is the dark palette and the default. `.light` holds
the light one. `LIGHT_PALETTE_READY` in `useTheme.tsx` is the switch that hides
Light and System if the palette ever needs pulling.

**The one decision the palette turns on: gold changes job, not hue.** On the
dark canvas `--gold` measures 10.6:1 and is an excellent ink. The identical
colour on white is **1.9:1** — invisible, not weak — and has to fall to about
L 0.55 before it carries body text. So light mode redefines `--gold` to a deeper
antique gold and flips `--gold-foreground` to near-white. That is cheaper than a
second token because the codebase has 54 `text-gold` and 29 `border-gold` uses
needing it darker against only 16 that fill with it. No component changed.

Three supporting rules, all of which will look wrong if undone:
- **The page is warm ivory, never `#fff`.** White throws the gold grey.
- **Glow is a dark-mode idiom.** `gold-glow` becomes a ring plus honest
  elevation; shadows go warm-grey, because black shadows on ivory read as holes.
- **Film grain is `multiply 0.035`, not `overlay 0.12`.** At the dark-mode value
  it looks like dirt on paper.

**`--primary-ink` is not the same as `--primary`.** `--primary` is a *fill*
colour. Used as 10px text on a dark chip it measured 2.07:1 — 273 failures on
`/cinemas` alone, long predating light mode. `--primary-ink` is the readable
version (L 0.66 dark / 0.42 light). If you need emerald *text*, use the ink.

**The hero scrim is theme-aware and directional.** `--hero-scrim` and
`--hero-vignette` protect the left text column and fall away by 80% so the
poster is visible. A full-frame wash makes the title readable and the image
invisible — that was the first attempt. `0.88` alpha in the text column is set
by the gold chip text, which needs more help than the title does.

**Verifying a palette change:** contrast maths beats eyeballing, and the
codebase has already shipped two colours that measured far worse than they
looked. Sweep every text node against its composited background rather than
trusting spot checks — the last sweep covered ~1,000 elements per page across
both themes and found 273 pre-existing failures nobody had noticed.

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

   **Do not scrape that endpoint for screen types. It is a no-op — checked.**
   An earlier version of this note said we store `format: "Regular"` for every
   Cine Royal screening and that their API could recover the real screen type.
   That was true when written and stopped being true once the chip parser began
   reading `time-chip-exp` and `f6e2ab3`/`ce8edcb` canonicalised formats.
   cinemauae now supplies Cine Royal's screen types itself, and they agree with
   Cine Royal's own API exactly: on a live comparison of one film's 18
   screenings, **18 unchanged, 0 changed**. The distribution today is Standard
   579, Royal Class 99, Royal Kids 66, Royal Plus 59 — and note their API's
   coarser grouping does not even carry Royal Plus, so adopting it would lose
   detail as well as cost a request per film per day.

   The enrichment was written, shipped and reverted (`8a0aef7`, `113affd`)
   because this note was trusted over a query against the live table. Before
   building anything on a claim in this file, check the data.

   What that endpoint still uniquely has, if a use ever appears:
   `availableSeats`, `screen` (e.g. CINEMA 4), and `showTime` as a true UTC
   instant. None of those are rendered anywhere today.

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

3. **`resolve-posters` runs on GET as well as POST**, so a casual health check
   against that URL triggers real work. It is otherwise no longer outstanding —
   see the closed list below.

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

8. **Cine Royal will never get exact links; Reel now gets film-level ones.**
   Cine Royal cannot (§11.1) — do not spend time there. Reel was in the same
   bucket until 2026-08-28 and is not any more: it now deep-links to the film's
   own booking page (§4b). Per-*screening* remains impossible for both, and the
   honesty markers from `696fe64` are still the answer for that.

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

12. **`npm run build` does not typecheck. `tsc` itself is now clean.** The build
    script is `vite build`, which strips types without checking them, so Vercel
    deploys green regardless. The 3 `notify_subscribers` errors were cleared on
    2026-08-27 when the other machine regenerated
    `src/integrations/supabase/types.ts`; `npx tsc --noEmit` now reports zero.

    **Add `tsc --noEmit` to CI — this is still open and still worth doing.** The
    `requestPrecise`/`MouseEvent` bug (`f453d80`) sat in a typed codebase, was
    reported by the compiler the whole time, and shipped anyway because nothing
    in the pipeline runs the check.

    **`scripts/` is outside the tsconfig include**, so those files are only
    checked by running them. Renaming `fetchReelFilms` → `fetchReelFeed` broke
    `check-reel-links.mts` and `tsc` said nothing. Run a script after touching
    what it imports.

    Two notes on hand-editing the generated types file. It says "regenerate,
    never hand-edit", and that is right in general — but `director`,
    `cast_names` and `backdrop_url` were added by hand this session because
    regenerating needs Supabase CLI auth that is not set up on this machine.
    They are correct and `tsc` is clean, but the file is now part-generated and
    part-hand-written, and a future regeneration will overwrite the hand edits.
    If the columns vanish from the types after someone regenerates, that is why.

13. **Vercel Web Analytics reads low by design.** It reports only from production
    and its `/_vercel/insights` request is blocked by ad blockers. Vercel's
    **runtime logs** are the source of truth for whether anyone visited — the
    site is SSR, so every page view hits the function and is logged server-side.
    It went uninstalled for a week because Vercel's own PR branch was never
    merged, which is why the dashboard honestly read 0 (`05e88aa`).

14. **Adding a dependency means updating BOTH lockfiles.** The repo carries
    `bun.lock` and `bunfig.toml` alongside `package-lock.json`. Updating only
    `package-lock` leaves bun's lockfile without the package, and an install
    against a frozen bun lockfile then fails to resolve the import at build.

15. **`/coming-soon` posters hotlink `cinema.aptrixx.com`.** There is no storage
    layer behind that page, so `resolve-posters` cannot reach them. The IMDb ids
    are parsed and present, so resolving through TMDB inside the server route —
    reusing `TMDB_API_KEY`, cached with the film list — is a contained change
    whenever it is wanted.

16. **The three filter dropdowns have no accessible names.** They read as bare
    unlabelled buttons in the accessibility tree.

17. **Terms and Privacy pages do not exist.** They are 404s. A public site
    without them reads as unfinished to visitors and to Google's quality
    signals, and the account menu deliberately omits the links rather than
    pointing at nothing.

18. **No backlinks — and this is now measured, not asserted.** UAE position
    10.7 with the technical work finished and the tags matching the queries.
    That is the page-1 boundary, and what stands between the site and page 1 is
    that nothing links to it. UAE listings sites, local communities, a Google
    Business Profile. **Nothing technical will substitute for it** — see §10b
    for the numbers this conclusion rests on.

19. **Nothing on the site can earn a link.** Schedules do not get linked to;
    guides do. "Best cinemas in Dubai", IMAX vs Dolby, that sort of thing. This
    is the gap between a site that is technically correct and one that ranks.
    The Reel feed carries screen names for every session, so a genuinely
    accurate "which UAE screens are Dolby / IMAX / 4DX" page is a small amount
    of work away and is the sort of thing that gets cited.

20. **The trim banner over-counts.** "Showing 4 of N screens" reported totals
    that included days other than the one selected — 4 of 34 at a moment when
    only 88 screenings remained that day. The chips are right, the total is
    suspect. Introduced with the banner, not with the three-day scrape.

### Closed since this list was written

- ~~**Reel Dubai Marina has Abu Dhabi coordinates**~~ — **fixed 2026-08-26**,
  along with its twin. It shared Cinema City's Abu Dhabi point byte for byte, so
  it read ~125 km away to every Dubai visitor.

  The duplicate name is the whole cause: cinemauae publishes **one**
  `Marina Mall Cinema` page and we carry two venues under that name, so the
  `e9b8bf9` bulk update could not attribute it and skipped **both** rows — which
  is why Cinema City's Abu Dhabi value was an unverified estimate too, and why
  both were still 4-decimal in a file that is otherwise 6. If another duplicate
  name appears, expect the same silent skip.

  Both now come from Google Maps, each confirmed by the listing's own address
  rather than by the pin looking plausible — accepting a plausible-looking
  result is what produced the 23 km Al Qana and 27 km National Cinema errors.
  Reel `25.076812, 55.140668` (Level 2, Dubai Marina Mall, Al Marsha St), which
  sits ~700 m inland of Roxy's The Beach as it should; Cinema City
  `24.47666, 54.322447` (Cinemacity Starlight, Marina Mall Abu Dhabi), ~130 m
  from the old estimate, so that one was never really wrong. cinemauae's single
  page reads `25.076236, 55.141459`, 120 m from the Reel value — independent
  confirmation that the page they publish is the Dubai screen.
- ~~**No sitemap, no structured data, content invisible to crawlers**~~ —
  **done 2026-08-25/26.** See §10b. 8 pages with no film data in the HTML
  became 116 server-rendered URLs with JSON-LD throughout.
- ~~**`/movie/$slug` renders the raw lowercase slug as its `<h1>`**~~ — it was
  the fallback for "data has not arrived", and with no server data that was the
  whole page. Fixed by the loader.
- ~~**Multi-day showtimes are impossible**~~ — **wrong, and now shipped.**
  cinemauae serves three days behind `?d=0|1|2`. See §4; the earlier conclusion
  came from guessing at parameter names rather than reading the page.
- ~~**`resolve-posters` unscheduled**~~ — scheduled as `resolve-posters-daily`.
- ~~**Home page chain tiles opened an unfiltered board**~~ — they passed
  `search={{}}`, so picking VOX showed all seven (`70e9d9a`). Note that
  `validateSearch` does **not** sanitise in this app: `useSearch()` returns the
  raw query string, verified with an unrelated `?t=` param that came through
  intact. Validate params in the component.
- ~~**Novo deep links**~~ — **done.** Novo now publishes real per-screening
  session URLs (`uae.novocinemas.com/seat-selection/cinema/9/session/342071`):
  189 screenings, 189 distinct URLs. Roxy gained them too.
- ~~**No light palette**~~ — **done 2026-08-28.** See §10c.
- ~~**Reel deep links impossible**~~ — **wrong twice over.** Film-level links
  ship, and Reel's showtimes now come from Reel. See §4b and §8.12.

### Opened 2026-08-28

21. **Director and cast are stored but rendered nowhere.** `cinema_films.director`
    (446 rows) and `.cast_names` (489) are populated and the scraper keeps them
    fresh. They were pulled from the movie page because the presentation needed
    more design work than the spec line got. Turning them back on is a render
    change — but put them back in the `Movie` JSON-LD at the same time, not
    before: Google asks that structured data describe what the page shows, and
    `movieSchema` currently omits `director`/`actor` deliberately for that reason.

22. **Four titles have no backdrop and one has no recoverable IMDb id.**
    `Shark Attack` ships `SharkAttackIMDB.jpg`, so no id can be derived and it
    keeps a hotlinked poster. `Harry Potter & The Philosopher's Stone`, `Aks Sir`
    and `El Set Lamma` matched no TMDB record. All five fall back to the poster
    in the hero, which is correct behaviour, not a bug to chase.

23. **The Reel feed carries 16 days; the site shows 3.** ~214 sessions a day sit
    unused for days 4–16. Surfacing them needs a UI answer for a date strip where
    only one chain has results — days that would read as "the other chains have
    closed" rather than "we do not have their data". Deliberately deferred.

24. **`.env` is committed and the repo is public.** It currently holds only
    publishable values (`SUPABASE_URL`, `SUPABASE_PROJECT_ID`,
    `SUPABASE_PUBLISHABLE_KEY` and their `VITE_` twins) which already ship in the
    browser bundle, so nothing is leaked today. But the pattern is a loaded gun:
    if a service-role key or `SCRAPER_INGEST_TOKEN` ever lands in that file it
    goes straight into a public repo. Those live in Vercel and must stay there.

25. **`SCRAPER_INGEST_TOKEN` is unreachable from a dev machine.** It exists only
    in Vercel and the CLI here is logged out, so the scraper cannot be run
    locally against live data. Workaround used twice this session: change code,
    push, then trigger the deployed endpoint — which means **waiting for the
    deploy before triggering**, or the old code runs. Verify the deploy landed
    (compare an asset hash) rather than assuming.

26. **`set_posters` and `ingest_cinema_films` bodies still live only in the
    database.** Extends item 10. Both were edited again this session; the current
    definitions are in the live DB and in scratch SQL files, not in the repo.

27. **Stale film slugs are still in Google's index.** Source titles change, so
    `/movie/{old-slug}` accumulates. Those now 404 correctly (they used to
    serve an empty 200), but Google will keep requesting them for weeks and
    they are still earning impressions in the meantime. Nothing to do beyond
    letting the 404s drop them — do **not** redirect them to the new slug
    unless the title genuinely renamed the same film, and never redirect them
    all to `/cinemas`, which is a soft-404 pattern of its own.

28. **`/cinemas` has no JSON-LD.** Every other page type carries it. It is the
    main browse page and the only structural gap left in the markup. Small.

### Closed

- ~~**TMDB posters**~~ — **done, with a ceiling.** Every row that has an
  `imdb_id` is resolved; the rest have none and never can be. See §10.
- ~~**`resolve-posters` unscheduled**~~ — **scheduled 2026-08-22** as
  `resolve-posters-daily` (jobid 12, `17 4 * * *`, active). The backlog was
  cleared by hand at the same time: 152 of 152 eligible rows resolved, 0 left.
  A healthy daily run should therefore report a *small* `candidates` count, not
  a large one — a number climbing back into three figures means the job has
  stopped firing and the decay has resumed.
- ~~**`/cinemas` copy says "every three hours"**~~ — fixed, then the whole header
  was rewritten for visitors rather than for us (`3559c4c`).
- ~~**Poster `alt` attributes empty**~~ — already fixed before it was noticed.
- ~~**165 screenings dated 11 Aug**~~ — cleared by retirement as expected.


---

## 12. How to verify things are healthy

Three checked-in scripts, all read-only. Run them from the repo root:

```bash
npx tsx scripts/check-service-area.mts   # UAE outline vs 26 known places + every venue
npx tsx scripts/check-reel-feed.mts      # stored vs Reel's own feed, per day
npx tsx scripts/check-reel-links.mts     # Reel deep-link coverage and every URL
```

`check-service-area` is the one to run **after adding a venue**. The outline
decides whether a visitor's own position is used for distances, and a screen
outside it would quietly report everyone as being abroad — a silent failure with
no error anywhere. The first outline drawn traced the coastline *through* the
seafront cinemas and put thirteen real screens out at sea; the venue sweep at
the bottom of that script is what caught it.

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

```sql
-- poster coverage. "resolved" should equal "eligible"; if it starts trailing,
-- resolve-posters-daily has stopped firing.
select count(*)                                                           as active_rows,
       count(*) filter (where imdb_id is not null)                        as eligible,
       count(*) filter (where poster_url like 'https://image.tmdb.org/%') as resolved
from cinema_films where is_active;
```

```bash
# resolve posters now rather than waiting for 04:17 UTC
curl -sS -X POST "https://www.showsouk.com/api/public/hooks/resolve-posters" \
  -H "Content-Type: application/json" -d '{}'
```

A healthy poster response looks like:
`{"ok":true,"candidates":13,"resolved":13,"notFoundOnTmdb":0,"lookupsFailed":0,"rowsUpdated":108}`

`candidates` climbing into three figures means the cron has stopped firing and
the ratio is decaying again. `notFoundOnTmdb` rising means films whose IMDb id
TMDB does not carry — that is a ceiling, not a fault. Note `rowsUpdated` comes
from `set_posters`, which over-reports (§11.11); trust the SQL above instead.

```sql
-- three-day coverage. "both" should be most of the catalogue once a full pass
-- has run (~4 hours). Falling rather than rising means writes are landing
-- incomplete — see §4, a page must be written all-or-nothing.
select count(*) filter (where d1 and d2) as both_days,
       count(*) filter (where d1 <> d2)  as one_day,
       count(*) filter (where not d1 and not d2) as neither
from (
  select exists (select 1 from jsonb_array_elements(f.showtimes) s
                 where s->>'date' = to_char((now() at time zone 'Asia/Dubai')::date + 1, 'YYYY-MM-DD')) as d1,
         exists (select 1 from jsonb_array_elements(f.showtimes) s
                 where s->>'date' = to_char((now() at time zone 'Asia/Dubai')::date + 2, 'YYYY-MM-DD')) as d2
  from cinema_films f where f.is_active
) x;
```

```bash
# what a run actually did. pagesWalked is reported on both branches now, and is
# the number PAGES_PER_RUN must stay at or under.
curl -sS -X POST "https://www.showsouk.com/api/public/hooks/scrape-aggregator" \
  -H "Content-Type: application/json" -d '{}'
```

A healthy cinemas response looks like:
`{"ok":true,"visited":36,"pagesWalked":12,"failed":0,"ingest":{"upserted":233,"retired":0}}`

`visited` should be roughly three times `pagesWalked` — that is the three days
per page. If it equals `pagesWalked`, only `d=0` is being read and tomorrow's
screenings are about to be deleted by the next write.
