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
import { useState } from "react";
import { MapPin } from "lucide-react";

import {
  CINEMA_LABELS,
  fetchChainFilms,
  filmSlug,
  hasUpcomingScreeningsOn,
  mergeFilmsByTitle,
  rankByTrending,
  showtimesByVenue,
} from "@/lib/cinemas";
import { DAY_COUNT, dayKeys } from "@/lib/days";
import { DaySelector } from "@/components/day-selector";
import { FilmBlockHeader } from "@/components/film-block-header";
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

/**
 * The venue as a searcher writes it: "Yas Mall Cinema", "Mega Mall Cinema".
 *
 * Nearly every name in VENUES already ends in "Cinema", so this usually returns
 * the name untouched. The exception is "Kempinski Private Cinema Mall of
 * Emirates", which carries the word mid-string and must not be given a second.
 */
function venuePhrase(name: string): string {
  return /cinema/i.test(name) ? name : `${name} Cinema`;
}

/**
 * The <title>, budgeted to what Google actually renders.
 *
 * Rewritten from Search Console (24 Aug – 2 Sep 2026). The venue tier drew more
 * impressions than anything else on the site and converted almost none of them:
 * /cinemas/vox/reem-mall sat at position 10.9 on 78 impressions for zero clicks,
 * /cinemas/vox/yas-mall at 15.5 on 173 for zero, /cinemas/novo/mega-mall at 11.6
 * on 127 for zero. A page ranking that well with no clicks is not a ranking
 * problem, it is a title that does not look like the search.
 *
 * The searches behind those impressions were, near enough without exception,
 * the mall and not the chain:
 *
 *     reem mall movies · yas mall cinema movies today · megamall cinema
 *     dragon mart movie timings · mega mall cinema timings today
 *     manar mall cinema show timings today · barari mall cinema
 *
 * Nobody types "VOX Cinemas Reem Mall", which is what we led with. So the venue
 * goes first and the chain moves behind the dash. "Timings" is in here because
 * it is how the query is actually phrased locally and it appeared nowhere in
 * our copy.
 *
 * Candidates are ordered longest first and the first that fits wins; each step
 * drops whatever earns least: "& Timings", then the city, then "Today". The
 * venue phrase and "Showtimes" are never dropped — between them they are the
 * query. There is no "| ShowSouk" rung: the brand earns nothing on a domain
 * nobody searches for yet, and it costs eleven characters the venue name needs.
 *
 * The city outranks "& Timings" deliberately. Several mall names repeat across
 * emirates — Marina Mall is Reel in Dubai and Cinema City in Abu Dhabi, and
 * there are four City Centres — so the city is what tells a searcher which
 * result is theirs. "Timings" still appears in every description below.
 */
function venueTitle(chainLabel: string, venueName: string, city: string): string {
  const venue = venuePhrase(venueName);
  const BUDGET = 60;
  const candidates = [
    `${venue} Showtimes & Timings Today — ${chainLabel}, ${city}`,
    `${venue} Showtimes Today — ${chainLabel}, ${city}`,
    `${venue} Showtimes Today — ${chainLabel}`,
    `${venue} Showtimes — ${chainLabel}`,
    `${venue} Showtimes`,
  ];
  return candidates.find((t) => t.length <= BUDGET) ?? candidates[candidates.length - 1]!;
}

export const Route = createFileRoute("/cinemas_/$chain_/$venue")({
  loader: async ({ params }) => {
    const venue = findVenue(params.chain, params.venue);
    if (!venue) throw notFound();

    const days = dayKeys();
    const films = await fetchChainFilms(params.chain, days);

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

    return { films: atVenue, days, venueName: venue.name, city: venue.city };
  },
  head: ({ params, loaderData }) => {
    const chainLabel = CINEMA_LABELS[params.chain] ?? params.chain;
    const venue = venuePhrase(loaderData?.venueName ?? params.venue.replace(/-/g, " "));
    const city = loaderData?.city ?? "the UAE";
    const canonical = `${ORIGIN}/cinemas/${params.chain}/${params.venue}`;
    // Leads with the venue for the same reason the title does, and carries
    // "movie timings" because that is the phrasing the queries arrive in.
    //
    // Budgeted the same way as the title. The long form sits at ~160 for the
    // longest venue names, which is exactly where it gets cut, so the short
    // form drops the closing clause rather than let Google choose the cut.
    const full = `${venue} movie timings today — every film showing at ${chainLabel}, ${city}, with times and a direct link to book on the cinema's own site.`;
    const description =
      full.length <= 158
        ? full
        : `${venue} movie timings today — every film showing at ${chainLabel}, ${city}, with a direct booking link.`;
    return {
      meta: [
        { title: venueTitle(chainLabel, venue, city) },
        { name: "description", content: description },
        { property: "og:title", content: `${venue} Showtimes — ${chainLabel}` },
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
  const { films, days, venueName, city } = Route.useLoaderData();
  // Defaulted from the loader rather than a fresh new Date(): the HTML can come
  // from the page cache, and a client that disagreed with it about what "today"
  // is would select a tab the server never rendered.
  const [day, setDay] = useState(days[0]);
  const isToday = day === days[0];

  const chainLabel = CINEMA_LABELS[chain] ?? chain;
  const name = shortName(venueName);
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
  const siblings = VENUES.filter((v) => v.cinema === chain && v.name !== venueName);
  // The other names people use for this screen. See Venue.aliases: these come
  // from queries that already reach the page, on spellings the page never said.
  const aliases = findVenue(chain, venueParam)?.aliases ?? [];

  const jsonLd = jsonLdDocument([
    {
      "@type": "MovieTheater",
      "@id": `${ORIGIN}/cinemas/${chain}/${venueParam}#theater`,
      name: `${chainLabel} ${name}`,
      ...(aliases.length ? { alternateName: aliases } : {}),
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
          <p className="text-sm uppercase tracking-[0.2em] text-primary">
            {isToday ? "Today’s showtimes" : "Showtimes"}
          </p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {chainLabel} {name}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-4 text-primary" />
            {city}
            <span className="mx-1 opacity-50">·</span>
            {showing.length} {showing.length === 1 ? "film" : "films"} showing
          </p>
          {/* Reads as an aside to a visitor and answers "am I in the right
              place?" for someone who searched "06 mall cinema". Kept to the
              names in Venue.aliases so it stays a sentence, not a keyword list. */}
          {aliases.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Also known as {aliases.slice(0, -1).join(", ")}
              {aliases.length > 1 ? " or " : ""}
              {aliases[aliases.length - 1]}.
            </p>
          )}
        </header>

        {/* Same picker as /cinemas, so the three days behave the same wherever
            you meet them. */}
        <DaySelector value={day} onChange={setDay} days={DAY_COUNT} className="mb-8" />

        {showing.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            {isToday
              ? `No screenings left today at ${chainLabel} ${name}.`
              : `No screenings listed for that day yet at ${chainLabel} ${name}.`}{" "}
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
                  className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
                >
                  {/* Genre and certificate only, as on every other header. The
                      card gained a bordered header strip here so it matches the
                      chain and browse cards — it was the odd one out, a padded
                      box with the title floated inside it. */}
                  <FilmBlockHeader
                    heading
                    title={film.title}
                    slug={filmSlug(film.title)}
                    badges={[film.genre, film.rating]}
                  />
                  <div className="flex flex-wrap gap-2 p-5">
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
