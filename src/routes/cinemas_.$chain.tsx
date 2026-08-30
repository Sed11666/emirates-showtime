/**
 * Route "/cinemas/{chain}" — one chain's showtimes across the UAE.
 *
 * The filename uses the trailing-underscore form (`cinemas_.$chain`) so this
 * does NOT nest inside routes/cinemas.tsx. Without it, TanStack would treat the
 * browse page as a layout and render it around this one.
 *
 * Why this exists rather than /cinemas?cinema=vox: people search "vox cinemas
 * showtimes", not "cinema showtimes filtered to vox". A query parameter cannot
 * carry its own title, description or canonical, so the filtered view was
 * unrankable by construction. This is the same data at a URL that can rank.
 *
 * Server-rendered, like the rest: the point is that a crawler sees the times.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Clapperboard, MapPin } from "lucide-react";

import {
  CINEMAS,
  CINEMA_LABELS,
  fetchChainFilms,
  filmSlug,
  hasUpcomingScreeningsOn,
  mergeFilmsByTitle,
  rankByTrending,
  showtimesByVenue,
  type CinemaKey,
} from "@/lib/cinemas";
import { DAY_COUNT, dayKeys } from "@/lib/days";
import { DaySelector } from "@/components/day-selector";
import { VENUES, venueSlug } from "@/lib/venues";
import {
  VenueShowtimesBlock,
  countUrlUses,
  filmLevelFallback,
} from "@/components/venue-showtimes";
import { jsonLdDocument } from "@/lib/structured-data";

const ORIGIN = "https://www.showsouk.com";

function isChain(value: string): value is CinemaKey {
  return CINEMAS.some((c) => c.key === value);
}

export const Route = createFileRoute("/cinemas_/$chain")({
  loader: async ({ params }) => {
    // Unknown chains 404 rather than rendering an empty page. A soft 200 on a
    // nonsense URL is how a site accumulates thin pages in the index.
    if (!isChain(params.chain)) throw notFound();
    // All three days up front. The read is the same either way — the day
    // filter has always run in JS — and this page has no client query to fetch
    // the rest later, so anything the picker can reach has to be here.
    const days = dayKeys();
    return { films: await fetchChainFilms(params.chain, days), days };
  },
  head: ({ params }) => {
    const label = CINEMA_LABELS[params.chain] ?? params.chain;
    const canonical = `${ORIGIN}/cinemas/${params.chain}`;
    const screens = VENUES.filter((v) => v.cinema === params.chain).length;
    const description = `${label} showtimes across ${screens} screens in the UAE — today's times by cinema, with a direct link to book on ${label}'s own site.`;
    return {
      meta: [
        { title: `${label} Showtimes UAE — Today's Times | ShowSouk` },
        { name: "description", content: description },
        { property: "og:title", content: `${label} Showtimes in the UAE` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: ChainPage,
  notFoundComponent: () => (
    <p className="mx-auto max-w-3xl p-10 text-center text-muted-foreground">
      No such cinema chain.{" "}
      <Link to="/cinemas" className="text-gold underline-offset-4 hover:underline">
        Browse all cinemas
      </Link>
    </p>
  ),
});

function ChainPage() {
  const { chain } = Route.useParams();
  const { films, days } = Route.useLoaderData();
  // Defaulted from the loader rather than a fresh new Date(): the HTML can come
  // from the page cache, and a client that disagreed with it about what "today"
  // is would select a tab the server never rendered.
  const [day, setDay] = useState(days[0]);
  const isToday = day === days[0];

  const label = CINEMA_LABELS[chain] ?? chain;
  const screens = VENUES.filter((v) => v.cinema === chain);
  const cities = [...new Set(screens.map((v) => v.city))].sort();

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

  const jsonLd = jsonLdDocument([
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Cinemas", item: `${ORIGIN}/cinemas` },
        { "@type": "ListItem", position: 3, name: label, item: `${ORIGIN}/cinemas/${chain}` },
      ],
    },
    {
      "@type": "ItemList",
      // Day-aware so the markup never contradicts the list beneath it. A
      // crawler only ever sees the server render, which is today.
      name: isToday ? `Films showing at ${label} today` : `Films showing at ${label} on ${day}`,
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
          <span className="text-foreground">{label}</span>
        </nav>

        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Now showing</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {label} Showtimes in the UAE
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {showing.length} {showing.length === 1 ? "film" : "films"} playing{" "}
            {isToday ? "today" : "that day"} across {screens.length} {label}{" "}
            {screens.length === 1 ? "screen" : "screens"} in{" "}
            {cities.length === 1 ? cities[0] : `${cities.length} emirates`}. Pick a time to book
            with {label} directly — we never sell the ticket.
          </p>
        </header>

        {/* Same picker as /cinemas, so the three days behave the same wherever
            you meet them. */}
        <DaySelector value={day} onChange={setDay} days={DAY_COUNT} className="mb-8" />

        {/* Every screen, named. This is the text that makes the page findable
            for "vox mall of the emirates showtimes" and its many cousins. */}
        <section className="mb-10 rounded-xl border border-border/70 bg-card/50 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
            <MapPin className="size-4 text-primary" /> {label} cinemas
          </h2>
          <ul className="flex flex-wrap gap-2">
            {screens.map((venue) => (
              <li key={venueSlug(venue.name)}>
                <Link
                  to="/cinemas/$chain/$venue"
                  params={{ chain, venue: venueSlug(venue.name) }}
                  className="inline-block rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                >
                  {venue.name.replace(/\s+Cinema$/i, "")}
                  <span className="ml-1.5 text-xs opacity-70">{venue.city}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {showing.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            {isToday
              ? `No ${label} screenings left today.`
              : `No ${label} screenings listed for that day yet.`}{" "}
            <Link to="/cinemas" className="text-gold underline-offset-4 hover:underline">
              See what else is on
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-6">
            {showing.map((film) => {
              const board = showtimesByVenue(film.showtimes, day, film.venues[0], {
                maxVenues: 6,
                maxTimesPerVenue: 10,
              });
              const uses = countUrlUses(board.venues);
              return (
                <article
                  key={film.title}
                  className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
                    <h2 className="min-w-0 truncate font-display text-lg font-semibold">
                      <Link
                        to="/movie/$slug"
                        params={{ slug: filmSlug(film.title) }}
                        className="hover:text-gold"
                      >
                        {film.title}
                      </Link>
                    </h2>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {/* Genre and certificate only, matching /movie/$slug. */}
                      {[film.genre, film.rating].filter(Boolean).join(" · ")}
                    </span>
                  </div>

                  <div className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                    {board.venues.map((venue) => (
                      <VenueShowtimesBlock
                        key={venue.venue}
                        venue={venue}
                        filmTitle={film.title}
                        filmSlug={filmSlug(film.title)}
                        chain={chain}
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
                        <Clapperboard className="size-3.5" />
                        Showing {board.venues.length} of {board.totalVenues} screens — see all
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Chains link to each other so a crawler reaching one reaches them all
            without needing the sitemap. */}
        <nav className="mt-12 border-t border-border/60 pt-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Other UAE cinemas</h2>
          <ul className="flex flex-wrap gap-2">
            {CINEMAS.filter((c) => c.key !== chain).map((c) => (
              <li key={c.key}>
                <Link
                  to="/cinemas/$chain"
                  params={{ chain: c.key }}
                  className="rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
