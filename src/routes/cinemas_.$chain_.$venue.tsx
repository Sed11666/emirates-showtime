/**
 * Route "/cinemas/{chain}/{venue}" — one screen's showtimes.
 *
 * This is the tier with the real long-tail volume: "reel dubai mall showtimes",
 * "novo al ain showtimes". Someone searching that has already chosen where they
 * are going and only wants the times, which is exactly what this page is.
 *
 * Both segments use the trailing-underscore form so neither the browse page nor
 * the chain page becomes a layout wrapped around this one.
 *
 * Server-rendered, and 404s on an unknown chain or venue rather than showing an
 * empty page — 64 real screens is a good set of landing pages, and any number
 * of invented ones is a liability.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

import {
  CINEMA_LABELS,
  fetchChainFilms,
  filmSlug,
  hasUpcomingScreenings,
  mergeFilmsByTitle,
  rankByTrending,
  showtimesByVenue,
} from "@/lib/cinemas";
import { toDayKey } from "@/lib/days";
import { VENUES, venueSlug } from "@/lib/venues";
import {
  VenueShowtimesBlock,
  countUrlUses,
  filmLevelFallback,
} from "@/components/venue-showtimes";
import { jsonLdDocument } from "@/lib/structured-data";

const ORIGIN = "https://www.showsouk.com";

function findVenue(chain: string, slug: string) {
  return VENUES.find((v) => v.cinema === chain && venueSlug(v.name) === slug);
}

/** The venue name without the "Cinema" every one of them carries. */
function shortName(name: string): string {
  return name.replace(/\s+Cinema$/i, "");
}

export const Route = createFileRoute("/cinemas_/$chain_/$venue")({
  loader: async ({ params }) => {
    const venue = findVenue(params.chain, params.venue);
    if (!venue) throw notFound();

    const day = toDayKey(new Date());
    const films = await fetchChainFilms(params.chain, day);

    // Narrow to this screen here rather than in the component, so the payload
    // serialised into the HTML is one venue's times and not the whole chain's.
    const atVenue = films
      .map((film) => ({
        ...film,
        showtimes: (Array.isArray(film.showtimes) ? film.showtimes : []).filter((entry) => {
          if (!entry || typeof entry !== "object") return false;
          return (entry as Record<string, unknown>)["venue"] === venue.name;
        }),
      }))
      .filter((film) => film.showtimes.length > 0);

    return { films: atVenue, day, venueName: venue.name, city: venue.city };
  },
  head: ({ params, loaderData }) => {
    const chainLabel = CINEMA_LABELS[params.chain] ?? params.chain;
    const name = loaderData?.venueName
      ? shortName(loaderData.venueName)
      : params.venue.replace(/-/g, " ");
    const city = loaderData?.city ?? "the UAE";
    const canonical = `${ORIGIN}/cinemas/${params.chain}/${params.venue}`;
    const description = `Today's showtimes at ${chainLabel} ${name}, ${city}. Every film and time on screen now, with a direct link to book on ${chainLabel}'s own site.`;
    return {
      meta: [
        { title: `${chainLabel} ${name} Showtimes — ${city} | ShowSouk` },
        { name: "description", content: description },
        { property: "og:title", content: `${chainLabel} ${name} Showtimes` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: VenuePage,
  notFoundComponent: () => (
    <p className="mx-auto max-w-3xl p-10 text-center text-muted-foreground">
      No such cinema.{" "}
      <Link to="/cinemas" className="text-gold underline-offset-4 hover:underline">
        Browse all cinemas
      </Link>
    </p>
  ),
});

function VenuePage() {
  const { chain, venue: venueParam } = Route.useParams();
  const { films, day, venueName, city } = Route.useLoaderData();

  const chainLabel = CINEMA_LABELS[chain] ?? chain;
  const name = shortName(venueName);
  // One card per film, only films with something left to watch, most-trending
  // first — the same ranking the home page uses, so a visitor who arrives here
  // from a banner finds that film at the top rather than buried in an
  // alphabetical list. Ordering used to be whatever Postgres returned, which
  // was `order by title`, so every listing on the site opened on whichever film
  // happened to start with "A".
  const showing = rankByTrending(
    mergeFilmsByTitle(films).filter((film) => hasUpcomingScreenings(film.showtimes)),
    { dayKey: day },
  );
  const siblings = VENUES.filter((v) => v.cinema === chain && v.name !== venueName);

  const jsonLd = jsonLdDocument([
    {
      "@type": "MovieTheater",
      "@id": `${ORIGIN}/cinemas/${chain}/${venueParam}#theater`,
      name: `${chainLabel} ${name}`,
      url: `${ORIGIN}/cinemas/${chain}/${venueParam}`,
      address: {
        "@type": "PostalAddress",
        addressLocality: city,
        addressCountry: "AE",
      },
      parentOrganization: { "@type": "Organization", name: chainLabel },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Cinemas", item: `${ORIGIN}/cinemas` },
        { "@type": "ListItem", position: 3, name: chainLabel, item: `${ORIGIN}/cinemas/${chain}` },
        {
          "@type": "ListItem",
          position: 4,
          name,
          item: `${ORIGIN}/cinemas/${chain}/${venueParam}`,
        },
      ],
    },
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
          <Link to="/cinemas" className="hover:text-foreground">
            Cinemas
          </Link>
          <span className="mx-1.5">/</span>
          <Link to="/cinemas/$chain" params={{ chain }} className="hover:text-foreground">
            {chainLabel}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{name}</span>
        </nav>

        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Today&rsquo;s showtimes</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {chainLabel} {name}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-4 text-primary" />
            {city}
            <span className="mx-1 opacity-50">·</span>
            {showing.length} {showing.length === 1 ? "film" : "films"} showing
          </p>
        </header>

        {showing.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No screenings left today at {chainLabel} {name}.{" "}
            <Link
              to="/cinemas/$chain"
              params={{ chain }}
              className="text-gold underline-offset-4 hover:underline"
            >
              See other {chainLabel} cinemas
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            {showing.map((film) => {
              // One venue, so no venue cap — this page exists to list every time
              // at this screen and trimming it would defeat the purpose.
              const board = showtimesByVenue(film.showtimes, day, venueName);
              const uses = countUrlUses(board.venues);
              return (
                <article
                  key={film.title}
                  className="rounded-xl border border-border/60 bg-card/40 p-5"
                >
                  <div className="mb-3 flex items-baseline justify-between gap-3">
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
                      {[film.genre, film.language, film.rating].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {siblings.length > 0 ? (
          <nav className="mt-12 border-t border-border/60 pt-6">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Other {chainLabel} cinemas
            </h2>
            <ul className="flex flex-wrap gap-2">
              {siblings.map((v) => (
                <li key={venueSlug(v.name)}>
                  <Link
                    to="/cinemas/$chain/$venue"
                    params={{ chain, venue: venueSlug(v.name) }}
                    className="rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                  >
                    {shortName(v.name)}
                    <span className="ml-1.5 text-xs opacity-70">{v.city}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </main>
    </div>
  );
}
