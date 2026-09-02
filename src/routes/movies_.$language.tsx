/**
 * Route "/movies/{language}" — everything showing in one language.
 *
 * The tier a competitor had and we did not. "malayalam movies in dubai",
 * "hindi movies uae" and their cousins are high-intent and specific, and the
 * only surface that answered them was the language dropdown on /cinemas — a
 * query parameter, which cannot carry its own title, description or canonical
 * and was therefore unrankable by construction. Same reasoning as the chain
 * and city tiers.
 *
 * Nine pages, not language × city. That second axis is 72 near-identical URLs
 * funnelling into one list, which is the doorway pattern §10b rejects for
 * film × city and rejects here for the same reasons.
 *
 * The trailing-underscore filename keeps this out of routes/movies.tsx, which
 * would otherwise become a layout wrapped around it.
 *
 * Server-rendered, and 404s on a language we have no page for.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Languages } from "lucide-react";

import {
  fetchLanguageFilms,
  filmSlug,
  hasUpcomingScreeningsOn,
  mergeFilmsByTitle,
  rankByTrending,
  showtimesByVenue,
} from "@/lib/cinemas";
import { DAY_COUNT, dayKeys } from "@/lib/days";
import { LANGUAGE_BY_SLUG } from "@/lib/languages";
import { DaySelector } from "@/components/day-selector";
import { FilmBlockHeader } from "@/components/film-block-header";
import {
  VenueShowtimesBlock,
  countUrlUses,
  filmLevelFallback,
} from "@/components/venue-showtimes";
import { jsonLdDocument } from "@/lib/structured-data";

const ORIGIN = "https://www.showsouk.com";

export const Route = createFileRoute("/movies_/$language")({
  loader: async ({ params }) => {
    const language = LANGUAGE_BY_SLUG[params.language];
    if (!language) throw notFound();
    const days = dayKeys();
    return { films: await fetchLanguageFilms(language, days), days, language };
  },
  head: ({ params, loaderData }) => {
    const language = loaderData?.language ?? LANGUAGE_BY_SLUG[params.language] ?? params.language;
    const canonical = `${ORIGIN}/movies/${params.language}`;
    const description = `${language} films showing in UAE cinemas today — showtimes by cinema across Dubai, Abu Dhabi and the Emirates, with a direct link to book.`;
    return {
      meta: [
        { title: `${language} Movies in the UAE — Showtimes Today | ShowSouk` },
        { name: "description", content: description },
        { property: "og:title", content: `${language} Movies Showing in the UAE` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: LanguagePage,
  notFoundComponent: () => (
    <p className="mx-auto max-w-3xl p-10 text-center text-muted-foreground">
      We have no listings in that language.{" "}
      <Link to="/cinemas" search={{}} className="text-gold underline-offset-4 hover:underline">
        Browse all cinemas
      </Link>
    </p>
  ),
});

function LanguagePage() {
  const { language: languageParam } = Route.useParams();
  const { films, days, language } = Route.useLoaderData();
  // Defaulted from the loader rather than a fresh new Date(): the HTML can come
  // from the page cache, and a client that disagreed with it about what "today"
  // is would select a tab the server never rendered.
  const [day, setDay] = useState(days[0]);
  const isToday = day === days[0];

  const showing = rankByTrending(
    mergeFilmsByTitle(films).filter((film) => hasUpcomingScreeningsOn(film.showtimes, day)),
    { dayKey: day },
  );
  const cities = [...new Set(films.map((f) => f.city).filter(Boolean) as string[])].sort();
  const others = Object.entries(LANGUAGE_BY_SLUG).filter(([slug]) => slug !== languageParam);

  const jsonLd = jsonLdDocument([
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Cinemas", item: `${ORIGIN}/cinemas` },
        {
          "@type": "ListItem",
          position: 3,
          name: `${language} movies`,
          item: `${ORIGIN}/movies/${languageParam}`,
        },
      ],
    },
    {
      // Day-aware so the markup never contradicts the list beneath it. A
      // crawler only ever sees the server render, which is today.
      "@type": "ItemList",
      name: isToday
        ? `${language} films showing in the UAE today`
        : `${language} films showing in the UAE on ${day}`,
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
          <Link to="/cinemas" search={{}} className="hover:text-foreground">
            Cinemas
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{language}</span>
        </nav>

        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">
            {isToday ? "Now showing" : "Showtimes"}
          </p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {language} Movies in the UAE
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {showing.length} {language} {showing.length === 1 ? "film" : "films"} playing{" "}
            {isToday ? "today" : "that day"}
            {cities.length > 0
              ? ` across ${cities.length === 1 ? cities[0] : `${cities.length} emirates`}`
              : ""}
            . Pick a time to book with the cinema directly — we never sell the ticket.
          </p>
        </header>

        {/* Same picker as /cinemas, so the three days behave the same wherever
            you meet them. */}
        <DaySelector value={day} onChange={setDay} days={DAY_COUNT} className="mb-8" />

        {showing.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            {isToday
              ? `No ${language} screenings left today.`
              : `No ${language} screenings listed for that day yet.`}{" "}
            <Link
              to="/cinemas"
              search={{}}
              className="text-gold underline-offset-4 hover:underline"
            >
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
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* The languages link to each other so a crawler reaching one reaches
            them all without needing the sitemap. */}
        <nav className="mt-12 border-t border-border/60 pt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Languages className="size-4 text-primary" /> Movies in other languages
          </h2>
          <ul className="flex flex-wrap gap-2">
            {others.map(([slug, name]) => (
              <li key={slug}>
                <Link
                  to="/movies/$language"
                  params={{ language: slug }}
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
