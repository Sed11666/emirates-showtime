# Fix missing showtimes on the homepage

## What's actually wrong

I checked the live data. There are 55 active films (VOX 28, Novo 16, Reel 6, Roxy 5) and almost all have showtimes stored — so the scrapers did work. Three separate problems hide those times:

1. **The day rolled over.** Every stored showtime is dated `2026-08-08`, but in Dubai it is already `2026-08-09` (00:26). The homepage defaults to "Today", finds nothing dated today, and hides the whole "Today's Showtimes" section.
2. **Reel and Roxy times have no venue or date.** Their times are stored as bare strings (`"07:45pm"`), not `{venue, date, time}` objects like VOX and Novo. The venue-grouped board skips those entirely, so Reel and Roxy never show times anywhere.
3. **The scrapers haven't run since 07:51 UTC today** (about 13 hours ago), even though they were meant to refresh every 3 hours. The scheduled job state isn't readable from here, so this needs to be verified and re-scheduled as part of the fix.

## The fix

**Showtime display (frontend)**
- When the selected day has no matching showtimes but the film does have times, fall back to showing its latest available schedule with a small "latest schedule" note instead of rendering nothing.
- Treat times scraped without a date as valid for the selected day rather than dropping them.
- Group Reel/Roxy string-only times under the film's known venue(s) so they appear on the board like VOX and Novo.
- Show an explicit "showtimes are being refreshed" message instead of silently hiding the section.

**Scraper reliability (backend)**
- Verify the scheduled refresh jobs exist and are firing; recreate the 3-hourly incremental run and the 5am Dubai full refresh if they are missing.
- Stamp scraped showtimes with the Dubai date at scrape time for the string-only chains (Reel, Roxy) so their times carry a date and venue like the others.
- Run a full refresh once after the fix so today's (Aug 9) schedule is loaded.

## Technical notes

- `src/lib/cinemas.ts` — `showtimesByVenue` / `showtimesForDay`: add same-day fallback, treat undated entries as always-valid, and use `fallbackVenue` for string entries (currently only object entries are read).
- `src/routes/index.tsx` — showtime board: render a fallback state instead of `null` when `showtimeBoard` is empty.
- `src/routes/api/public/hooks/scrape-cinemas.ts` — `normalizeShowtimes`: default `date` to the Dubai day and `venue` to the film's venue when the source only gives a bare time.
- Re-check and re-create the pg_cron schedules hitting `/api/public/hooks/scrape-cinemas`.
