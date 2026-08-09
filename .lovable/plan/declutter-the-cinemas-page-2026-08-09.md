# Declutter the Cinemas page

Today each Cinemas card repeats the same film once per chain and dumps raw showtime chips, venue lists and a "Book on VOX" link onto the tile. Replace that with the same clean poster grid the home page uses, where clicking a movie opens its own showtimes page.

## What changes

1. **One card per movie.** Merge chain duplicates by title (same helper the home page uses) so "Superman" appears once, not four times.
2. **Poster-first grid.** Use the shared movie poster card: artwork, title, genre/language, rating, duration and format badges (2D / 3D / IMAX / 4DX). No showtime chips, no venue paragraph, no external booking link on the card.
3. **Click through to the movie page.** Each card links to `/movie/<slug>` — the existing BookMyShow-style page with the date strip, filters, nearest-cinema-first venue blocks and time chips that deep-link to the chain's booking page. Exactly what the screenshot shows.
4. **Filters stay.** Search, day selector, cinema, city and language filters keep working; they filter which movies appear in the grid. The day filter still hides films with no screenings that day.
5. **"Cinemas near you" panel stays** as-is, and nearest-first ordering is preserved for the merged cards (a merged film uses its closest screen).

## Technical notes

- `src/routes/cinemas.tsx`: apply `mergeFilmsByTitle()` after the existing filter pass, compute the minimum distance across the merged rows, sort nearest-first, and render `MoviePosterCard` with `filmToPoster()` + `fullWidth` in a responsive grid (2 / 3 / 5 columns). Delete the inline `<article>` markup, showtime chips and booking anchor; drop now-unused imports.
- No changes to `src/routes/movie.$slug.tsx`, the data layer, or the scrapers.
