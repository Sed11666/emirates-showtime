# Deep-link every showtime chip to the cinema's own booking page

Today each showtime chip on a movie page links to one generic URL for the whole venue block (`booking_url` or `source_url` of the film). The goal: clicking a specific time opens that exact screening on VOX / Reel / Novo / Roxy's official site.

## What changes for you

- Each time chip becomes its own link to the cinema's booking page for that screening (opens in a new tab).
- When a chain does not publish a per-screening link, the chip falls back to the film's page on that chain's site (never a dead link).
- Same behaviour on the movie showtimes page and anywhere else time chips appear.

## How it works

1. **Scrapers capture the link per screening.** In `src/routes/api/public/hooks/scrape-cinemas.ts`:
   - Add `booking_url` to the showtime objects in both `EXTRACT_SCHEMA` and `SHOWTIME_SCHEMA`, and update both prompts to ask for the href behind each individual time button (the anchor the time links to, absolute URL).
   - `normalizeShowtimes` keeps `booking_url` when present, resolves relative paths against the page origin, and drops anything that is not http(s).
2. **Fallback chain.** For a screening with no captured link, resolution order is: screening link → the venue's film link → film `booking_url` → film `source_url`. This is centralised in `src/lib/showtimes.ts` so every surface behaves the same.
3. **Type + UI.** `Screening` in `src/lib/showtimes.ts` gains `bookingUrl: string | null`; `venueBlocks` fills it. `src/routes/movie.$slug.tsx` uses `screening.bookingUrl ?? block.bookingUrl` on each chip, with `target="_blank" rel="noopener noreferrer"`.
4. **Refresh the data.** Existing rows have no per-time links, so after deploying I trigger a forced re-scrape for vox, reel, novo and roxy so the new field is populated. Until a chain is re-scraped, its chips use the fallback.

## Notes

- No database migration is needed: `showtimes` is a JSON column, so the extra key stores as-is.
- Events scraper already stores one booking link per event; unchanged.
- Verification: run the scrape endpoint for one chain, query a few rows to confirm `booking_url` inside `showtimes`, then load a movie page and check the chips point at chain URLs.
