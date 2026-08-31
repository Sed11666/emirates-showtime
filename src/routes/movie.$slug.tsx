/**
 * Route "/movie/$slug" — BookMyShow-style movie detail / showtime picker.
 *
 * $slug comes from filmSlug(title). Because the same movie exists as separate
 * rows per chain, we gather every CinemaFilm sharing titleKey(), then build
 * VenueBlocks (lib/showtimes) sorted nearest-first using useUserLocation.
 * Filters: date (three Dubai days), cinema, city. No language filter — a page is
 * one film and a booking is for one language, so there is nothing to choose
 * between. No format filter either: the screen type is on every chip already.
 * Each time chip deep-links to that exact screening on the chain's own site.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  breadcrumbSchema,
  jsonLdDocument,
  movieSchema,
  screeningSchemas,
} from "@/lib/structured-data";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Locate } from "lucide-react";

import { DAY_COUNT, buildDayOptions, toDayKey } from "@/lib/days";
import { FilterRow } from "@/components/filter-row";
import {
  VenueShowtimesBlock,
  countUrlUses,
  filmLevelFallback,
} from "@/components/venue-showtimes";
import {
  CINEMA_LABELS,
  fetchFilmBySlug,
  filmSlug,
  titleKey,
  type CinemaFilm,
} from "@/lib/cinemas";
import { venueBlocks } from "@/lib/showtimes";
import { useUserLocation } from "@/hooks/useUserLocation";

/**
 * Cities this film actually plays in, busiest first.
 *
 * Ranked by how many rows name each city, which stands in for screen count —
 * so Dubai leads for most films, which is also where the search volume is.
 */
function citiesFor(films: Array<{ city: string | null }> | undefined): string[] {
  const counts = new Map<string, number>();
  for (const film of films ?? []) {
    if (film.city) counts.set(film.city, (counts.get(film.city) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([city]) => city);
}

/**
 * The <title>, built to match how people actually search.
 *
 * Search Console, UAE, at position 10.7: "khalifa movie in dubai", "toy story 5
 * dubai", "toy story 5 sharjah", "the end of oak street showtimes near dubai".
 * Five of seven queries named a city; the old title said "in the UAE" and named
 * none, so the strongest term in the query appeared nowhere in the title.
 *
 * Budgeted to ~60 characters because that is roughly what Google renders. When
 * it does not fit, the brand is dropped before the city is: "| ShowSouk" earns
 * nothing for a domain nobody is searching for yet, and the city is the term
 * doing the work.
 *
 * Two cities, not five. Listing every emirate a film plays in reads as keyword
 * stuffing and pushes the film's own name out of the visible part of the tag.
 */
function titleTag(name: string, cities: string[]): string {
  const BRAND = " | ShowSouk";
  const BUDGET = 60;
  for (const count of [2, 1]) {
    if (cities.length < count) continue;
    const where = count === 2 ? `${cities[0]} & ${cities[1]}` : cities[0]!;
    const base = `${name} Showtimes in ${where}`;
    if (base.length + BRAND.length <= BUDGET) return base + BRAND;
    if (base.length <= BUDGET) return base;
  }
  const fallback = `${name} Showtimes & Tickets in the UAE`;
  return fallback.length + BRAND.length <= BUDGET ? fallback + BRAND : fallback;
}

/**
 * The meta description, naming the chains that actually have the film.
 *
 * This used to hardcode all seven — so Toy Story 5's page told Google it played
 * at Roxy and Cine Royal, which it does not. Chains are worth naming because
 * "toy story 5 novo cinemas" is a real query this page already surfaces for;
 * naming ones that are wrong is just a claim we cannot support.
 */
function descriptionTag(name: string, cities: string[], chains: string[]): string {
  const BUDGET = 158; // Google renders ~155-160; past that is invisible.
  const where = cities.length > 0 ? cities.slice(0, 3).join(", ") : "the UAE";
  const tail = "Book direct — nearest cinemas first.";
  // Drop chains until it fits. Cities go first and are never trimmed here:
  // they are what the ranking queries name, where the chain list is a bonus.
  for (const count of [4, 3, 2, 1, 0]) {
    const named = chains.slice(0, count).map((key) => CINEMA_LABELS[key] ?? key);
    const rest = chains.length > named.length ? " and more" : "";
    const who = named.length > 0 ? ` at ${named.join(", ")}${rest}` : "";
    const text = `${name} showtimes in ${where}${who}. ${tail}`;
    if (text.length <= BUDGET) return text;
  }
  return `${name} showtimes in ${where}. ${tail}`;
}

export const Route = createFileRoute("/movie/$slug")({
  // Server-rendered: without this the page shipped an empty shell, the <h1>
  // fell back to the raw lowercase slug, and a crawler saw a title tag over no
  // content. Only this film's rows are serialised, so the payload is a few KB.
  /**
   * A slug with no film 404s rather than rendering an empty shell.
   *
   * Titles change at the source — "El Gawahergy (Arabic)" became "El
   * Gawahergy" — and the old slug stays in Google's index long after it stops
   * matching anything. It was answering 200 with the raw slug as its <h1>, no
   * showtimes and no content: a soft 404, which Google treats as a quality
   * problem rather than a dead link. /movie/el-gawahergy-arabic had earned 14
   * impressions in that state, so the cost is real — an empty page ranking is
   * worse than no page at all.
   *
   * Safe to 404 on an empty result: rows are upserted rather than deleted, so a
   * film that is genuinely showing is always present. An unmatched slug means
   * the title changed or the film retired, and both should be a 404.
   */
  loader: async ({ params }) => {
    const films = await fetchFilmBySlug(params.slug);
    if (films.length === 0) throw notFound();
    return { films };
  },
  head: ({ params, loaderData }) => {
    // Prefer the real title over a title-cased slug: the slug turns "Above and
    // Below" into "Above And Below", and a <title> that disagrees with the <h1>
    // is a needless mismatch for both readers and crawlers. Falls back to the
    // slug when the loader has not run, which is what happens on a 404.
    const name =
      loaderData?.films?.[0]?.title ??
      params.slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    const canonical = `https://www.showsouk.com/movie/${params.slug}`;
    const cities = citiesFor(loaderData?.films);
    const chains = [...new Set((loaderData?.films ?? []).map((film) => film.cinema))];
    const where = cities.length > 0 ? cities.slice(0, 2).join(" & ") : "the UAE";
    return {
      meta: [
        { title: titleTag(name, cities) },
        { name: "description", content: descriptionTag(name, cities, chains) },
        { property: "og:title", content: `${name} — Showtimes in ${where}` },
        {
          property: "og:description",
          content: `Pick a date and book ${name} at the cinema closest to you.`,
        },
        { property: "og:type", content: "video.movie" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: MovieShowtimesPage,
  errorComponent: ({ error }) => (
    <p className="mx-auto max-w-3xl p-10 text-center text-destructive" role="alert">
      {error.message}
    </p>
  ),
  notFoundComponent: () => (
    <p className="mx-auto max-w-3xl p-10 text-center text-muted-foreground">Film not found.</p>
  ),
});

function MovieShowtimesPage() {
  const { slug } = Route.useParams();
  // Three days, matching DAY_COUNT and the scraper's SCRAPE_DAYS. This was
  // briefly collapsed to today alone when the database held one day; it holds
  // three now, so the picker is real again rather than decorative.
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));
  const [chain, setChain] = useState<string>("all");
  // Named cityFilter, not city: useUserLocation already returns a `city`, and
  // that one is where the visitor is rather than what they filtered to.
  const [cityFilter, setCityFilter] = useState<string>("all");

  const { coords, city, precise, outsideServiceArea, requestPrecise } = useUserLocation();
  useEffect(() => {
    if (!precise) requestPrecise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seeded from the loader so the server render already has the film, then
  // refetched for this slug alone.
  //
  // This used to share the whole-catalogue "cinema-films" query, which was
  // waste twice over: `matches` immediately filters the catalogue back down
  // to the rows the loader had already fetched, and seeding a key named for
  // the whole catalogue with one film's rows meant a later visit to the home
  // page rendered off that one film until its own refetch landed.
  //
  // initialDataUpdatedAt stays 0 deliberately: the HTML can come from the
  // page cache, so the seeded showtimes may be minutes old, and forcing the
  // refetch is what keeps a cached page honest. It now costs a few KB rather
  // than the entire catalogue.
  const { films: ssrFilms } = Route.useLoaderData();
  const { data, isLoading } = useQuery({
    queryKey: ["film", slug],
    queryFn: () => fetchFilmBySlug(slug),
    initialData: ssrFilms,
    initialDataUpdatedAt: 0,
  });

  /** Every chain's copy of this title. */
  const matches = useMemo<CinemaFilm[]>(
    () => (data ?? []).filter((film) => filmSlug(film.title) === slug),
    [data, slug],
  );

  const primary = matches[0];
  const chains = [...new Set(matches.map((f) => f.cinema))].sort();
  const cities = [...new Set(matches.map((f) => f.city).filter(Boolean) as string[])].sort();

  const filteredFilms = useMemo(
    () =>
      matches.filter(
        (film) =>
          (chain === "all" || film.cinema === chain) &&
          (cityFilter === "all" || film.city === cityFilter),
      ),
    [matches, chain, cityFilter],
  );

  const blocks = useMemo(
    () => venueBlocks(filteredFilms, day, coords).filter((block) => block.screenings.length > 0),
    [filteredFilms, day, coords],
  );

  /**
   * Counted across every venue of the film, not per venue: a URL used once is
   * that screening's, while one shared by several is a film page in disguise,
   * and only the whole-film view can tell those apart.
   */
  const uses = useMemo(
    () =>
      countUrlUses(
        blocks.map((block) => ({
          venue: block.venue,
          times: block.screenings,
          hiddenTimes: 0,
        })),
      ),
    [blocks],
  );

  /**
   * Whether any chip on this page is dashed. Derived from the same test the
   * chip itself uses rather than re-deriving it from the raw showtimes, so the
   * note cannot end up explaining a marker that is not there, or missing one
   * that is.
   */
  const hasIndirectBooking = useMemo(
    () =>
      blocks.some((block) =>
        block.screenings.some(
          (screening) => !(screening.bookingUrl && uses.get(screening.bookingUrl) === 1),
        ),
      ),
    [blocks, uses],
  );

  /** Each chain's own site, for chips with no screening link of their own. */
  const chainUrlByCinema = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const film of matches) {
      if (!map.has(film.cinema)) map.set(film.cinema, film.source_url);
    }
    return map;
  }, [matches]);

  const todayLabel = new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(new Date(`${day}T12:00:00`))
    .toUpperCase();

  /**
   * Describes exactly what this page renders: the film, and the screenings for
   * the day on screen. Marking up showings that are not visible is what Google
   * treats as spam, so the day filter here is the same one the UI uses.
   */
  const jsonLd = useMemo(() => {
    if (!primary) return null;
    return jsonLdDocument([
      movieSchema(primary, slug),
      ...screeningSchemas(matches, slug, day),
      breadcrumbSchema(primary.title, slug),
    ]);
  }, [primary, matches, slug, day]);

  return (
    <div className="min-h-screen bg-background">
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      ) : null}
      {/* ── Film strip ─────────────────────────────────────── */}
      <div className="border-b border-border/60 bg-card/40">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4">
          <Link
            to="/"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-gold/60 hover:text-gold"
            aria-label="Back"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {primary?.poster_url ? (
            <img
              src={primary.poster_url}
              alt={`${primary.title} poster`}
              className="h-16 w-12 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold uppercase tracking-wide sm:text-xl">
              {primary?.title ?? slug.replace(/-/g, " ")}
            </h1>
            {/* Genre and certificate only — runtime is carried by the spec line
                below, and the header sits beside the poster where a short label
                reads better than a full spec list. */}
            <p className="truncate text-sm text-muted-foreground">
              {[primary?.genre, primary?.rating].filter(Boolean).join(", ") ||
                "Now showing in UAE cinemas"}
            </p>
          </div>
        </div>
      </div>

      {/* ── What the film is ───────────────────────────────────
          Deliberately brief. Someone who clicked a poster wants a sentence to
          confirm they picked the right film, not a review — the times below are
          what they came for, and a wall of text pushes them off the screen.
          Every other UAE listings site leads with the marketing copy; leading
          with "is this the one, and when can I see it" is the difference. */}
      {primary?.synopsis ? (
        <section className="border-b border-border/60 bg-card/20">
          <div className="mx-auto w-full max-w-6xl px-4 py-5">
            <div className="flex gap-5">
              {primary.poster_url ? (
                <img
                  src={primary.poster_url}
                  alt=""
                  aria-hidden="true"
                  className="hidden h-40 w-28 shrink-0 rounded-lg object-cover sm:block"
                />
              ) : null}
              <div className="min-w-0">
                <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
                  {primary.synopsis}
                </p>
                {/* Specs carry no visible label: "Action" is self-evidently a
                    genre and "95 mins" a runtime, so printing the word doubles
                    the text for nothing and makes the label compete with the
                    value. The names stay for screen readers.

                    Set apart from the synopsis directly above, which is the
                    same muted colour: at 0.8125rem against the synopsis's
                    0.875rem the facts were literally quieter than the prose
                    summarising them. Now a touch larger, semibold and in full
                    foreground — three small moves rather than one loud one. */}
                <dl className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold text-foreground sm:text-[0.9375rem]">
                  {(
                    [
                      ["Genre", primary.genre],
                      ["Runtime", primary.duration_mins ? `${primary.duration_mins} mins` : null],
                      ["Rating", primary.rating],
                    ] as Array<[string, string | null]>
                  )
                    .filter((entry): entry is [string, string] => Boolean(entry[1]))
                    .map(([label, value], index) => (
                      <div key={label} className="flex items-center gap-2.5">
                        {/* Separator stays muted and unweighted: it should not
                            gain the emphasis the values just did. */}
                        {index > 0 ? (
                          <span
                            aria-hidden="true"
                            className="font-normal text-muted-foreground/50"
                          >
                            &middot;
                          </span>
                        ) : null}
                        <dt className="sr-only">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>

                {/* Director and cast are deliberately not rendered yet: the
                    presentation needed more design work than the spec line, so
                    they are held back rather than shipped cluttered. The scraper
                    keeps populating cinema_films.director and .cast_names, so
                    turning them back on is a render change only. */}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Date strip + filters ───────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-4 py-3">
          {/* Pick a day first: on a film page the visitor has chosen what to
              watch and is now choosing when, so the date leads the filters. */}
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {buildDayOptions(DAY_COUNT)
              .map((option) => {
                const active = option.value === day;
                const weekday = new Intl.DateTimeFormat("en-AE", {
                  timeZone: "Asia/Dubai",
                  weekday: "short",
                }).format(new Date(`${option.value}T12:00:00`));
                const dayNumber = new Intl.DateTimeFormat("en-AE", {
                  timeZone: "Asia/Dubai",
                  day: "numeric",
                  month: "short",
                }).format(new Date(`${option.value}T12:00:00`));
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDay(option.value)}
                    aria-pressed={active}
                    className={`min-w-[4.5rem] shrink-0 rounded-lg px-3 py-1.5 text-center transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="block text-[11px] font-semibold uppercase leading-tight">
                      {weekday}
                    </span>
                    <span className="block text-xs leading-tight">{dayNumber}</span>
                  </button>
                );
              })}
          </div>

          {/* Cinema and city are dropdowns, matching /cinemas. As pills they
              cycled through their values on click, so the options were invisible
              until you had clicked past them — unworkable at seven chains and
              eight emirates. Format stays a pill: it is a short, fixed set you
              toggle rather than choose between. */}
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            {/* Only offered when the film actually plays at more than one chain
                or city — a filter with a single option is a control that cannot
                do anything. */}
            {chains.length > 1 ? (
              <FilterRow
                label="Cinema"
                allLabel="All cinemas"
                value={chain}
                onChange={setChain}
                options={chains.map((c) => ({ value: c, label: CINEMA_LABELS[c] ?? c }))}
              />
            ) : null}
            {cities.length > 1 ? (
              <FilterRow
                label="City"
                allLabel="All cities"
                value={cityFilter}
                onChange={setCityFilter}
                options={cities.map((c) => ({ value: c, label: c }))}
              />
            ) : null}
          </div>

          {/* Not a filter, so it outlived the filter row: the nearest-first
              ordering is this page's main promise, and without a precise fix it
              is measuring from a city centre. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {outsideServiceArea ? (
              // The fix was granted and simply landed too far away, so the
              // button is replaced rather than left to do nothing.
              <p className="text-xs text-muted-foreground">
                You appear to be outside the UAE — screens are ordered from {city} city
                centre.
              </p>
            ) : !precise ? (
              <button
                type="button"
                // Wrapped, not passed by reference: requestPrecise's first parameter
                // is an onSuccess callback, so React would hand it the click
                // event and a successful fix would call that event as a function.
                onClick={() => requestPrecise()}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-gold/60 hover:text-gold"
              >
                <Locate className="size-3.5" /> Use my location
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-5">
        {isLoading ? <p className="text-muted-foreground">Loading showtimes…</p> : null}

        {!isLoading && blocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No screenings match these filters. Try another date or clear the filters.
          </p>
        ) : null}

        {!isLoading && hasIndirectBooking && blocks.length > 0 ? (
          <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="inline-block h-4 w-8 shrink-0 rounded border border-dashed border-border/60"
            />
            Dashed times open the cinema&rsquo;s booking site — that chain
            doesn&rsquo;t publish a link to a single screening.
          </p>
        ) : null}

        {/* The same panel every other page uses. This route had grown its own
            copy, which meant it silently lacked the two things that component
            exists to guarantee: the dashed marker on chips that cannot reach a
            single screening, and the film-level fallback that stops a chip
            opening someone else's seat map. */}
        <div className="space-y-3">
          {blocks.map((block) => (
            <VenueShowtimesBlock
              key={block.key}
              venue={{
                // Chain-qualified, unlike the pages that show one chain at a
                // time: this list spans every chain, and "Dubai Mall Cinema"
                // alone does not say whose it is.
                venue: `${CINEMA_LABELS[block.cinema] ?? block.cinema}: ${block.venue}`,
                times: block.screenings,
                hiddenTimes: 0,
                km: block.distanceKm,
              }}
              filmTitle={primary?.title ?? slug.replace(/-/g, " ")}
              filmSlug={slug}
              chain={block.cinema}
              filmUrl={filmLevelFallback(
                block.bookingUrl,
                chainUrlByCinema.get(block.cinema) ?? null,
                uses,
              )}
              chainUrl={chainUrlByCinema.get(block.cinema) ?? null}
              uses={uses}
              // Names the city actually being measured from, not a hardcoded
              // Dubai: with the picker set to Sharjah, "4.8 km from Dubai" was
              // both wrong and contradicted the header.
              distanceSuffix={precise ? "" : ` from ${city}`}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

