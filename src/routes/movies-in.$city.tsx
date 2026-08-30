/**
 * Route "/movies-in/{city}" — everything showing in one emirate today.
 *
 * The URL shape is deliberate. "/cinemas/dubai" would collide with
 * /cinemas/$chain, and "/cinemas/city/dubai" collides with the venue route,
 * which would read it as chain "city" and venue "dubai". "/movies-in/dubai"
 * avoids both and reads the way the query does: people search "movies in
 * dubai", not "dubai cinema listings".
 *
 * Server-rendered and 404s on an emirate we have no screens in, for the same
 * reason as the other landing tiers: eight real pages beat any number of empty
 * ones.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin } from "lucide-react";

import {
  CINEMA_LABELS,
  fetchCityFilms,
  filmSlug,
  hasUpcomingScreeningsOn,
  mergeFilmsByTitle,
  rankByTrending,
  showtimesByVenue,
} from "@/lib/cinemas";
import { DAY_COUNT, dayKeys } from "@/lib/days";
import { DaySelector } from "@/components/day-selector";
import { FilmBlockHeader } from "@/components/film-block-header";
import { CITY_BY_SLUG, VENUES, citySlug, venueSlug } from "@/lib/venues";
import {
  VenueShowtimesBlock,
  countUrlUses,
  filmLevelFallback,
} from "@/components/venue-showtimes";
import { jsonLdDocument } from "@/lib/structured-data";

const ORIGIN = "https://www.showsouk.com";

export const Route = createFileRoute("/movies-in/$city")({
  loader: async ({ params }) => {
    const city = CITY_BY_SLUG[params.city];
    if (!city) throw notFound();
    const days = dayKeys();
    return { films: await fetchCityFilms(city, days), days, city };
  },
  head: ({ params, loaderData }) => {
    const city = loaderData?.city ?? CITY_BY_SLUG[params.city] ?? params.city;
    const screens = VENUES.filter((v) => v.city === city).length;
    const canonical = `${ORIGIN}/movies-in/${params.city}`;
    const description = `Every film showing in ${city} today, across ${screens} cinema ${screens === 1 ? "screen" : "screens"}. Times by cinema, with a direct link to book on the chain's own site.`;
    return {
      meta: [
        { title: `Movies in ${city} Today — Showtimes & Cinemas | ShowSouk` },
        { name: "description", content: description },
        { property: "og:title", content: `Movies in ${city} Today` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: CityPage,
  notFoundComponent: () => (
    <p className="mx-auto max-w-3xl p-10 text-center text-muted-foreground">
      We have no cinemas listed there yet.{" "}
      <Link to="/cinemas" className="text-gold underline-offset-4 hover:underline">
        Browse all cinemas
      </Link>
    </p>
  ),
});

function CityPage() {
  const { city: cityParam } = Route.useParams();
  const { films, days, city } = Route.useLoaderData();
  // Defaulted from the loader rather than a fresh new Date(): the HTML can come
  // from the page cache, and a client that disagreed with it about what "today"
  // is would select a tab the server never rendered.
  const [day, setDay] = useState(days[0]);
  const isToday = day === days[0];

  const screens = VENUES.filter((v) => v.city === city);
  const chains = [...new Set(screens.map((v) => v.cinema))];
  // One card per film, only films with something left to watch, most-trending
  // first — the same ranking the home page uses, so a visitor who arrives here
  // from a banner finds that film at the top rather than buried in an
  // alphabetical list. Ordering used to be whatever Postgres returned, which
  // was `order by title`, so every listing on the site opened on whichever film
  // happened to start with "A".
  const showing = rankByTrending(
    mergeFilmsByTitle(films).filter((film) => hasUpcomingScreeningsOn(film.showtimes, day)),
    { dayKey: day },
  );
  const others = Object.entries(CITY_BY_SLUG).filter(([, name]) => name !== city);

  const jsonLd = jsonLdDocument([
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Cinemas", item: `${ORIGIN}/cinemas` },
        {
          "@type": "ListItem",
          position: 3,
          name: `Movies in ${city}`,
          item: `${ORIGIN}/movies-in/${cityParam}`,
        },
      ],
    },
    {
      "@type": "ItemList",
      // Day-aware so the markup never contradicts the list beneath it. A
      // crawler only ever sees the server render, which is today.
      name: isToday ? `Films showing in ${city} today` : `Films showing in ${city} on ${day}`,
      numberOfItems: showing.length,
      itemListElement: showing.slice(0, 40).map((film, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${ORIGIN}/movie/${filmSlug(film.title)}`,
        name: film.title,
      })),
    },
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
          <Link to="/cinemas" className="hover:text-foreground">
            Cinemas
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{city}</span>
        </nav>

        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">
            {isToday ? "Today" : "Showtimes"}
          </p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Movies in {city}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {showing.length} {showing.length === 1 ? "film" : "films"} showing across{" "}
            {screens.length} {screens.length === 1 ? "screen" : "screens"} from {chains.length}{" "}
            {chains.length === 1 ? "chain" : "chains"} in {city}. Pick a time to book with the
            cinema directly.
          </p>
        </header>

        {/* Same picker as /cinemas, so the three days behave the same wherever
            you meet them. */}
        <DaySelector value={day} onChange={setDay} days={DAY_COUNT} className="mb-8" />

        {/* Named screens, each linking to its own page — the internal links that
            make the venue tier reachable from a city query. */}
        <section className="mb-10 rounded-xl border border-border/70 bg-card/50 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
            <MapPin className="size-4 text-primary" /> Cinemas in {city}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {screens.map((venue) => (
              <li key={`${venue.cinema}-${venueSlug(venue.name)}`}>
                <Link
                  to="/cinemas/$chain/$venue"
                  params={{ chain: venue.cinema, venue: venueSlug(venue.name) }}
                  className="inline-block rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                >
                  {venue.name.replace(/\s+Cinema$/i, "")}
                  <span className="ml-1.5 text-xs opacity-70">
                    {CINEMA_LABELS[venue.cinema] ?? venue.cinema}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {showing.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            {isToday
              ? `No screenings left today in ${city}.`
              : `No screenings listed for that day yet in ${city}.`}{" "}
            <Link to="/cinemas" className="text-gold underline-offset-4 hover:underline">
              See what else is on
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-6">
            {showing.map((film) => {
              const board = showtimesByVenue(film.showtimes, day, film.venues[0], {
                maxVenues: 5,
                maxTimesPerVenue: 8,
              });
              const uses = countUrlUses(board.venues);
              return (
                <article
                  key={film.title}
                  className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
                >
                  {/* Genre and certificate only, as on every other header. */}
                  <FilmBlockHeader
                    heading
                    title={film.title}
                    slug={filmSlug(film.title)}
                    badges={[film.genre, film.rating]}
                  />

                  <div className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                    {board.venues.map((venue) => (
                      <VenueShowtimesBlock
                        key={venue.venue}
                        venue={venue}
                        filmTitle={film.title}
                        filmSlug={filmSlug(film.title)}
                        chain={film.cinema}
                        filmUrl={filmLevelFallback(film.booking_url, film.source_url, uses)}
                        chainUrl={film.source_url}
                        uses={uses}
                      />
                    ))}
                    {board.hiddenVenues > 0 ? (
                      <Link
                        to="/movie/$slug"
                        params={{ slug: filmSlug(film.title) }}
                        className="inline-flex items-center gap-1 text-sm text-gold hover:brightness-125"
                      >
                        Showing {board.venues.length} of {board.totalVenues} screens — see all
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <nav className="mt-12 border-t border-border/60 pt-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Other emirates</h2>
          <ul className="flex flex-wrap gap-2">
            {others.map(([slug, name]) => (
              <li key={slug}>
                <Link
                  to="/movies-in/$city"
                  params={{ city: slug }}
                  className="rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
