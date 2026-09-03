/**
 * Route "/cinemas" — Browse scraped films by chain, city, day and venue.
 *
 * Includes the "Cinemas near you" panel (browser geolocation -> nearestVenues)
 * and nearest-to-farthest ordering. Search + day selector filter the same
 * `cinema_films` dataset the home page uses.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Locate, MapPin, Navigation, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DaySelector } from "@/components/day-selector";
import { FilmBlockHeader } from "@/components/film-block-header";
import { FilterRow } from "@/components/filter-row";
import { UpcomingReleases } from "@/components/upcoming-releases";

import {
  CINEMAS,
  CINEMA_LABELS,
  type CinemaKey,
  fetchBrowseFilms,
  fetchCinemaFilmsForDay,
  filmGenres,
  filmSlug,
  hasDatedShowtimes,
  mergeFilmsByTitle,
  rankByTrending,
  showtimesByVenue,
  showtimesForDay,
  titleKey,
} from "@/lib/cinemas";

import {
  filmDistanceKm,
  matchesVenues,
  nearestVenues,
  venueDistanceKm,
  type NearbyVenue,
  bookingTarget,
} from "@/lib/venues";
import { formatDistance } from "@/lib/showtimes";
import { jsonLdDocument } from "@/lib/structured-data";
import { useUserLocation } from "@/hooks/useUserLocation";
import { UAE_CITIES } from "@/lib/listings";
import { DAY_COUNT, toDayKey } from "@/lib/days";

const ORIGIN = "https://www.showsouk.com";

export const Route = createFileRoute("/cinemas")({
  /**
   * Two params are linkable, and for the same reason: something elsewhere on
   * the site needs to open this page already scoped.
   *
   *   ?movie=<filmSlug>  — a movie card anywhere opens its times here
   *   ?cinema=<key>      — a chain tile on the home page opens that chain
   *
   * Every other filter stays local state.
   *
   * NOTE: this declares the shape, it does NOT sanitise. In this app
   * `useSearch()` returns the raw query string regardless of what is returned
   * here — verified with an unrelated `?t=` param, which came through intact.
   * The real validation is in the component. Do not add a param here and assume
   * a bad value cannot reach state.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { movie?: string; cinema?: string; view?: string } => {
    const movie = typeof search["movie"] === "string" ? search["movie"].trim() : "";
    const raw =
      typeof search["cinema"] === "string" ? search["cinema"].trim().toLowerCase() : "";
    const cinema = CINEMAS.some((c) => c.key === raw) ? raw : "";
    const view = search["view"] === "upcoming" ? "upcoming" : "";
    return {
      ...(movie ? { movie } : {}),
      ...(cinema ? { cinema } : {}),
      ...(view ? { view } : {}),
    };
  },
  /**
   * Server-rendered showtimes.
   *
   * Without this the HTML shipped an empty shell: zero film titles and zero
   * times, with everything fetched after hydration. Googlebot renders
   * JavaScript on a second pass that can lag days — useless for a board that
   * changes hourly — and most other crawlers do not render it at all. So the
   * page had 7,600 screenings and search engines could see none of them.
   *
   * Today only, because that is what the page opens on; the client's query
   * pulls the full three days immediately after.
   */
  loader: async () => ({ films: await fetchCinemaFilmsForDay(toDayKey(new Date())) }),
  head: () => ({

    meta: [
      { title: "UAE Cinema Showtimes — VOX, Star, Novo & More | ShowSouk" },
      {
        name: "description",
        content:
          "Filtered now-showing listings from seven UAE cinema chains — VOX, Star, Novo, Cinema City, Cine Royal, Reel and Roxy — refreshed automatically every 30 minutes.",
      },
      { property: "og:title", content: "UAE Cinema Showtimes — VOX, Star, Novo & More" },
      {
        property: "og:description",
        content:
          "Browse films now showing at VOX, Star, Novo, Cinema City, Cine Royal, Reel and Roxy in Dubai, Abu Dhabi and across the Emirates.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.showsouk.com/cinemas" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // Absolute, not "/cinemas": a relative canonical is legal but Google
    // documents absolute URLs as the reliable form, and og:url must be
    // absolute for social crawlers regardless.
    links: [{ rel: "canonical", href: "https://www.showsouk.com/cinemas" }],
  }),
  component: CinemasPage,
});

function CinemasPage() {
  const { movie: movieSlug, cinema: rawCinemaParam, view: rawView } = Route.useSearch();

  // Which of the two views is showing. In the URL because it has to survive a
  // refresh and be linkable; validated here because validateSearch does not
  // sanitise in this app (see the note on the route above).
  const view: "showing" | "upcoming" = rawView === "upcoming" ? "upcoming" : "showing";

  /**
   * Sanitise here rather than trusting validateSearch. Verified in this app:
   * useSearch() hands back the raw query string — an unrelated `?t=` cache
   * buster came through untouched — so the schema below is types and intent,
   * not a runtime filter. An unrecognised chain would otherwise match no films
   * and render "No films match these filters", which reads as broken data
   * rather than a bad link.
   */
  const cinemaParam = useMemo(() => {
    const raw = typeof rawCinemaParam === "string" ? rawCinemaParam.trim().toLowerCase() : "";
    return CINEMAS.some((c) => c.key === raw) ? raw : undefined;
  }, [rawCinemaParam]);
  const [search, setSearch] = useState("");
  const [cinema, setCinema] = useState<string>(cinemaParam ?? "all");
  const [city, setCity] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");
  const [genre, setGenre] = useState<string>("all");
  /**
   * Today, tomorrow, and the day after — the three days the scraper now reads.
   *
   * This was briefly collapsed to today alone, because the picker offered seven
   * days against a database that held one and silently rendered today's times
   * under future dates. The source does publish three days (?d=0|1|2 on each
   * film page, each with its own booking links); the earlier reading of it was
   * wrong. SCRAPE_DAYS in the aggregator and DAY_COUNT here must agree.
   */
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));
  const [nearOnly, setNearOnly] = useState(false);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied">("idle");

  // Arriving from a chain tile changes the param without always remounting, so
  // seeding the state at mount is not enough on its own. Only applied when the
  // param is present: navigating to a movie drops ?cinema, and silently
  // clearing the chain someone had chosen would be the more surprising outcome.
  useEffect(() => {
    if (cinemaParam) setCinema(cinemaParam);
  }, [cinemaParam]);

  // Shared visitor position: precise browser coords when granted, otherwise the
  // centre of the header city. Ask once on mount so the panel fills itself in.
  // Aliased: `city` here is the filter dropdown's value ("all", "Dubai", …),
  // which is a different thing from where the visitor actually is.
  const {
    coords,
    precise,
    outsideServiceArea,
    requestPrecise,
    city: userCity,
  } = useUserLocation();

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (precise) return;
    setGeoState("loading");
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "denied") setGeoState("denied");
      })
      .catch(() => undefined);
    requestPrecise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (precise) setGeoState("idle");
  }, [precise]);

  /**
   * Six closest screens to the visitor, nearest first, narrowed to the selected
   * chain. Unscoped it would sit directly above chain-filtered results naming
   * four other brands, which is what made the board look unfiltered even when
   * it was not.
   */
  const chainFilter = cinema === "all" ? null : (cinema as CinemaKey);
  const nearby = useMemo<NearbyVenue[] | null>(
    () => (coords ? nearestVenues(coords, 6, chainFilter) : null),
    [coords, chainFilter],
  );

  // Goes through the hook rather than calling getCurrentPosition again here.
  // The old copy wrote its own cache entry with no timestamp and asked for a
  // low-accuracy fix, so it both aged badly and started out imprecise.
  const requestLocation = (filterToNearby = true) => {
    setGeoState("loading");
    requestPrecise(
      (point) => {
        const venues = nearestVenues(point, 6, chainFilter);
        setNearOnly(filterToNearby);
        setGeoState("idle");
        if (filterToNearby && venues[0]) setCity(venues[0].city);
      },
      () => setGeoState("denied"),
    );
  };


  // Seeded from the loader so the first render — the one the server produces —
  // already has films in it. The query then refetches the complete three-day
  // set in the background, which is what day switching and film scoping need.
  const { films: ssrFilms } = Route.useLoaderData();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cinema-films", "browse"],
    queryFn: fetchBrowseFilms,
    initialData: ssrFilms,
    // initialData is today-only, so treat it as already stale and let the full
    // fetch start at once rather than sitting on a partial set.
    initialDataUpdatedAt: 0,
  });

  const films = useMemo(() => data ?? [], [data]);

  const languages = useMemo(
    () => [...new Set(films.map((f) => f.language).filter(Boolean) as string[])].sort(),
    [films],
  );

  /**
   * Genres, split out of the column rather than taken whole.
   *
   * The scraper stores them as one string per film — "Action, Crime, Drama" —
   * so the raw column has 35 distinct values where the market has 14 genres.
   * Offering those 35 as filter options would list "Action, Crime, Drama"
   * beside "Action, Comedy" and match neither the way anyone expects.
   *
   * Derived from the live catalogue, not hardcoded: the reference design lists
   * "Science Fiction" where our source says "Sci-Fi", and a hardcoded list
   * would have offered an option that silently matched nothing.
   */
  const genres = useMemo(() => {
    const found = new Set<string>();
    for (const film of films) for (const name of filmGenres(film)) found.add(name);
    return [...found].sort();
  }, [films]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matching = films.filter((film) => {
      // filmSlug runs through titleKey, so this matches the same title across
      // chains even when they spell it differently (El Gawahergy (Arabic) vs
      // El Gawahergy) — the visitor gets every screen showing it, not one chain.
      if (movieSlug && filmSlug(film.title) !== movieSlug) return false;
      if (cinema !== "all" && film.cinema !== cinema) return false;
      if (city !== "all" && (film.city ?? "").toLowerCase() !== city.toLowerCase()) return false;
      if (language !== "all" && film.language !== language) return false;
      // Membership, not equality: a film carries several genres and has to
      // match on any one of them.
      if (genre !== "all" && !filmGenres(film).includes(genre)) return false;
      if (term && !`${film.title} ${film.genre ?? ""} ${film.venues.join(" ")}`.toLowerCase().includes(term))
        return false;
      if (nearOnly && nearby && nearby.length > 0) {
        const nearChains = new Set(nearby.map((v) => v.cinema as string));
        if (!nearChains.has(film.cinema)) return false;
        if (film.venues.length > 0 && !matchesVenues(film.venues, nearby)) return false;
      }
      if (hasDatedShowtimes(film.showtimes)) {
        return showtimesForDay(film.showtimes, day).length > 0;
      }
      return true;
    });

    // Closest screen across every chain showing this title.
    const distanceByTitle = new Map<string, number>();
    if (coords) {
      for (const film of matching) {
        const km = filmDistanceKm(film.cinema, film.venues, coords);
        if (km === null) continue;
        const key = titleKey(film.title);
        const current = distanceByTitle.get(key);
        if (current === undefined || km < current) distanceByTitle.set(key, km);
      }
    }

    // One card per movie, most-trending first — the same ranking the home page,
    // chain pages and city pages use, so a film promoted in a banner sits at the
    // top here too instead of wherever the alphabet put it.
    //
    // Distance used to be the only sort key, and it barely discriminated: the
    // films people come looking for play at nearly every mall, so most of the
    // list shared one nearest-screen distance. Worse, with no location granted
    // every distance was null and the comparator evaluated Infinity - Infinity,
    // i.e. NaN, which the spec treats as 0 — so the whole board fell back to
    // whatever Postgres returned, which is `order by title`. That is why every
    // listing opened on a film beginning with "A".
    //
    // Distance is still computed and still shown on each card, and venues
    // *within* a card remain nearest-first (see the venue panel below), which is
    // where proximity actually helps someone choose.
    const ranked = rankByTrending(mergeFilmsByTitle(matching), { dayKey: day });
    return ranked.map((film) => ({
      film,
      distance: distanceByTitle.get(titleKey(film.title)) ?? null,
    }));
  }, [films, movieSlug, search, cinema, city, genre, language, day, nearOnly, nearby, coords]);

  /**
   * Whether anything on screen lacks a per-screening link, so the legend
   * explaining the dashed chips only appears when there is something to explain.
   */
  const hasIndirectBooking = useMemo(
    () =>
      filtered.some(({ film }) => {
        if (!Array.isArray(film.showtimes)) return false;
        const uses = new Map<string, number>();
        for (const row of film.showtimes as Array<Record<string, unknown>>) {
          const url = typeof row["booking_url"] === "string" ? row["booking_url"] : "";
          if (!url) return true; // no link at all
          uses.set(url, (uses.get(url) ?? 0) + 1);
        }
        return [...uses.values()].some((n) => n > 1); // one link, many screenings
      }),
    [filtered],
  );

  /** Title of the scoped film, for the banner. Falls back to un-slugging. */
  const scopedTitle = useMemo(() => {
    if (!movieSlug) return null;
    const match = films.find((f) => filmSlug(f.title) === movieSlug);
    if (match) return match.title;
    return movieSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }, [films, movieSlug]);

  /**
   * Structured data, which this page was the only listing tier to be missing.
   *
   * The chain, venue and city pages all carried a BreadcrumbList and an
   * ItemList; /cinemas — the page they all sit under, and the one with the most
   * films on it — carried none, so the tier's own hub was the one page Google
   * had no machine-readable summary of.
   *
   * Built from what is actually rendered, which on the server render is today
   * with no filters applied. That is the state the canonical URL describes, and
   * it is the only state a crawler sees.
   */
  const jsonLd = useMemo(() => {
    const listed = filtered.slice(0, 40);
    return jsonLdDocument([
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Cinemas", item: `${ORIGIN}/cinemas` },
        ],
      },
      {
        "@type": "ItemList",
        name: "Films now showing in UAE cinemas",
        numberOfItems: listed.length,
        itemListElement: listed.map(({ film }, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${ORIGIN}/movie/${filmSlug(film.title)}`,
          name: film.title,
        })),
      },
    ]);
  }, [filtered]);

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">

        {/* Says what the visitor gets, not how we get it. How often our scraper
            runs and when it last succeeded are our concerns, not theirs. */}
        <header className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-primary-ink">UAE cinemas</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">UAE Cinema Showtimes</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {view === "upcoming"
              ? "Films announced for release, soonest first. Showtimes appear here the day they open."
              : "Screenings at every major cinema across the Emirates. Pick a time to book with the cinema directly."}
          </p>
        </header>

        {/* One question — what should I watch — so one page. These were two nav
            items, which made the visitor choose a section before they had the
            information to choose with. */}
        <div className="mb-8 flex gap-2 border-b border-border/60" role="tablist">
          {(
            [
              { id: "showing", label: "Now Showing" },
              { id: "upcoming", label: "Upcoming" },
            ] as const
          ).map((tab) => {
            const active = view === tab.id;
            return (
              <Link
                key={tab.id}
                to="/cinemas"
                search={tab.id === "upcoming" ? { view: "upcoming" } : {}}
                role="tab"
                aria-selected={active}
                className={`-mb-px border-b-[3px] px-6 py-3.5 text-base font-semibold tracking-tight transition-colors sm:px-8 sm:text-lg ${
                  active
                    ? "border-gold text-gold"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {view === "upcoming" ? (
          <UpcomingReleases />
        ) : (
          <>
          <section className="mb-6 rounded-xl border border-border/70 bg-card/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                  <Navigation className="size-4 text-primary" />
                  {chainFilter ? `${CINEMA_LABELS[chainFilter]} near you` : "Cinemas near you"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {/* Count rather than a promised six: a smaller chain may not
                      have six screens — Reel has three. The heading already names
                      the chain, so this line does not repeat it. */}
                  {precise
                    ? `The ${nearby?.length ?? 0} closest screens to you, in a straight line — allow more by road.`
                    : outsideServiceArea
                      ? // Their location was granted and is simply too far away, so
                        // inviting them to share it again would be a dead end.
                        `You appear to be outside the UAE, so these are the closest screens to ${userCity} city centre.`
                      : "The closest screens to your selected city — share your location to sort from where you actually are."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!outsideServiceArea && (
                  <Button size="sm" variant="outline" onClick={() => requestLocation()} disabled={geoState === "loading"}>
                    <Locate className={`size-3.5 ${geoState === "loading" ? "animate-pulse" : ""}`} />
                    {precise ? "Update location" : "Use my location"}
                  </Button>
                )}

                {nearby && (
                  <Button
                    size="sm"
                    variant={nearOnly ? "default" : "ghost"}
                    onClick={() => setNearOnly((value) => !value)}
                  >
                    {nearOnly ? "Showing nearby only" : "Filter to nearby"}
                  </Button>
                )}
              </div>
            </div>

            {/* Not shown when the fix simply landed outside the UAE: the hook
                reports that through onError too, and telling someone to allow
                access they already granted sends them to fix the wrong thing. */}
            {geoState === "denied" && !outsideServiceArea && (
              <p className="mt-3 text-xs text-destructive">
                Location unavailable. Allow location access in your browser, or pick a city below.
              </p>
            )}

            {nearby && nearby.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
                {nearby.map((venue) => (
                  <li key={`${venue.cinema}-${venue.name}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setCinema(venue.cinema);
                        setCity(venue.city);
                      }}
                      className="group w-full rounded-2xl border border-border/60 bg-card/50 px-5 py-6 text-center transition-all hover:-translate-y-1 hover:border-gold/50 hover:gold-glow"
                    >
                      {/* Not truncated. Two columns on a 375px phone leaves
                          each card ~145px, which cut every real venue down to
                          "FOUNTAIN VI…" and "MERCATO M…" — the name is the only
                          reason to look at the card, so it wraps instead. */}
                      <p className="font-display text-sm font-bold uppercase leading-snug tracking-wide">
                        {venue.name}
                      </p>
                      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                        {CINEMA_LABELS[venue.cinema]} · {venue.city}
                      </p>
                      {/* The city name is appended only on the city-centre
                          fallback, where the distance is measured from a place
                          the visitor is not — most visibly for someone abroad.
                          On a real fix no suffix is needed: formatDistance
                          already marks the number an estimate, and the panel
                          heading says these are straight-line. */}
                      <p className="mt-1 text-xs text-gold">
                        {formatDistance(venue.distanceKm)}
                        {precise ? "" : ` from ${userCity}`}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}

          </section>


          <div className="mb-6 space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
            {/* Same field treatment as the header search overlay. */}
            <div className="flex items-center gap-2 rounded-2xl border border-gold/25 bg-card px-4 py-1">
              <Search className="size-4 shrink-0 text-primary" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search movies, cinemas & events"
                className="border-0 bg-transparent px-0 focus-visible:ring-0"
              />
            </div>

            {/* Three days is the source's ceiling, not a design choice — see
                SCRAPE_DAYS. Offering more would repeat the bug this replaced. */}
            <DaySelector value={day} onChange={setDay} days={DAY_COUNT} />

            {/* Side by side on anything wider than a phone: four dropdowns cost
                one row, where the old pills cost three wrapping rows. Two per
                row on a tablet and stacked on a phone, so no control is ever
                narrower than its longest option. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterRow
                label="Cinema"
                allLabel="All cinemas"
                value={cinema}
                onChange={setCinema}
                options={CINEMAS.map((c) => ({ value: c.key, label: c.label }))}
              />
              <FilterRow
                label="City"
                allLabel="All cities"
                value={city}
                onChange={setCity}
                options={UAE_CITIES.map((c) => ({ value: c, label: c }))}
              />
              {languages.length > 0 && (
                <FilterRow
                  label="Language"
                  allLabel="All languages"
                  value={language}
                  onChange={setLanguage}
                  options={languages.map((l) => ({ value: l, label: l }))}
                />
              )}
              {genres.length > 0 && (
                <FilterRow
                  label="Genre"
                  allLabel="All genres"
                  value={genre}
                  onChange={setGenre}
                  options={genres.map((g) => ({ value: g, label: g }))}
                />
              )}
            </div>
          </div>

          {/* Scoped to one film: say so plainly and give a one-click way out,
              otherwise a short list looks like broken filters. */}
          {scopedTitle && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Showing screens for{" "}
                <span className="font-semibold text-foreground">{scopedTitle}</span>
              </p>
              <Link
                to="/cinemas"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/60 hover:text-gold"
              >
                Show all films
              </Link>
            </div>
          )}

          {!isLoading && !error && hasIndirectBooking && filtered.length > 0 && (
            <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-8 shrink-0 rounded border border-dashed border-border/60"
              />
              Dashed times open the cinema&rsquo;s booking site — that chain
              doesn&rsquo;t publish a link to a single screening.
            </p>
          )}

          {isLoading && <p className="text-muted-foreground">Loading showtimes…</p>}
          {error && <p className="text-destructive">Could not load showtimes. Please try again.</p>}
          {!isLoading && !error && filtered.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              {scopedTitle
                ? `No more screenings for ${scopedTitle} today. Show all films, or check back tomorrow.`
                : "No films match these filters yet. The next scheduled scrape will fill this in."}
            </p>
          )}

          {/* Same showtimes-board treatment as the home page. */}
          <div className="space-y-5">
            {filtered.map(({ film, distance }) => {
              // Scoped to one film: list every screen. Browsing all films: trim,
              // or the page becomes thousands of rows.
              const board = showtimesByVenue(
                film.showtimes,
                day,
                film.venues[0],
                movieSlug ? undefined : { maxVenues: 4, maxTimesPerVenue: 8 },
              );
              const venues = board.venues
                .map((v) => ({ ...v, km: coords ? venueDistanceKm(v.venue, coords) : null }))
                // Nearest screen first, exactly as the rest of the site orders
                // venues. Screens we have no coordinates for sink to the bottom
                // rather than being dropped.
                .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));

              // A screening with no link of its own must not borrow another
              // screening's. For chains that publish per-screening URLs, the
              // film-level booking_url is just one of those sessions, so using it
              // as a fallback would send someone to the wrong showing — worse
              // than dropping them on the chain's own site. Only use it when it
              // is genuinely a film-level page (Cine Royal's /chooseScreen/slug).
              // How many screenings share each URL. A link used once is specific
              // to that screening; one shared across several is a film page
              // wearing a screening's clothes, which is how Cine Royal behaves.
              const urlUses = new Map<string, number>();
              for (const v of venues) {
                for (const t of v.times) {
                  if (t.bookingUrl) urlUses.set(t.bookingUrl, (urlUses.get(t.bookingUrl) ?? 0) + 1);
                }
              }
              const filmFallback =
                film.booking_url && !urlUses.has(film.booking_url)
                  ? film.booking_url
                  : film.source_url;
              return (
                <div
                  key={film.id}
                  className="overflow-hidden rounded-2xl border border-border/60 bg-card/40"
                >
                  <FilmBlockHeader
                    title={film.title}
                    badges={[
                      film.rating,
                      formatDistance(distance),
                    ]}
                    trailing={
                      /* Stays inside Cinemas: scoping this page to the film
                         shows every screen, which is what the old movie page
                         was for. */
                      movieSlug ? null : (
                        <Link
                          to="/cinemas"
                          search={{ movie: filmSlug(film.title) }}
                          className="inline-flex shrink-0 items-center gap-1 text-xs text-gold hover:brightness-125"
                        >
                          All times <ChevronRight className="size-3.5" />
                        </Link>
                      )
                    }
                  />

                  {venues.length > 0 ? (
                    /* Each screen is its own panel rather than a hairline-divided
                       row: with 36 venues on one film, dividers alone gave no
                       sense of where one cinema ended and the next began. */
                    <div className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                      {venues.map((venue) => (
                        /* Stacked, not two columns: a venue with 25 screenings
                           used to squeeze the name column to zero width, so the
                           cinema showed as a bare map pin with no name. */
                        <div
                          key={venue.venue}
                          className="rounded-xl border border-border/50 bg-background/40 p-4 transition-colors hover:border-border"
                        >
                          <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-foreground">
                              <MapPin className="size-4 shrink-0 self-center text-primary" />
                              {venue.venue}
                            </p>
                            {/* Without a real fix this is measured from the city
                                centre and can be tens of kilometres out, so say
                                which it is rather than implying precision. */}
                            {venue.km !== null ? (
                              <span className="text-xs text-muted-foreground">
                                {formatDistance(venue.km)}
                                {precise ? "" : ` from ${userCity}`}
                              </span>
                            ) : null}
                            <span className="ml-auto text-xs text-muted-foreground">
                              {venue.times.length} {venue.times.length === 1 ? "show" : "shows"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2.5">
                            {venue.times.map((screening) => {
                              // Straight out to the chain — no interstitial page.
                              // Per-screening deep link, else that screen's own
                              // page, else the film's page, else the chain.
                              // Never construct a booking URL.
                              const href = bookingTarget({
                                screeningUrl: screening.bookingUrl,
                                venueName: venue.venue,
                                chain: film.cinema,
                                filmUrl: filmFallback,
                              });
                              // Reel publishes no per-screening URL, so its chips
                              // can only reach the chain's own site. Looking
                              // identical to a chip that lands on a seat map sets
                              // the visitor up to feel misled, so say so: dashed
                              // border, muted label, and a tooltip.
                              const exact =
                                !!screening.bookingUrl && urlUses.get(screening.bookingUrl) === 1;
                              return (
                                <a
                                  key={`${screening.time}|${screening.format ?? ""}`}
                                  href={href ?? undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={
                                    exact
                                      ? undefined
                                      : "This cinema doesn't publish a direct link to a single screening — opens their booking site"
                                  }
                                  aria-label={`${
                                    exact ? "Book" : "Open the cinema's booking site for"
                                  } ${film.title} at ${venue.venue}, ${screening.time}${
                                    screening.format ? `, ${screening.format}` : ""
                                  }`}
                                  className={`flex min-w-[4.75rem] flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition-colors ${
                                    exact
                                      ? "border border-chip-border bg-background/60 hover:border-primary/70 hover:bg-primary/5"
                                      : "border border-dashed border-chip-border bg-transparent hover:border-foreground/40 hover:bg-muted/30"
                                  }`}
                                >
                                  <span
                                    className={`text-sm font-semibold leading-none ${
                                      exact ? "text-foreground" : "text-muted-foreground"
                                    }`}
                                  >
                                    {screening.time}
                                  </span>
                                  {/* Screen type matters as much as the time: a
                                      19:00 Gold seat is a different product from
                                      a 19:00 Standard one. */}
                                  {/* Not force-uppercased: formats are stored in
                                      canonical casing, and shouting them would
                                      turn "Samsung ONYX" into "SAMSUNG ONYX". */}
                                  <span
                                    className={`text-[10px] font-medium leading-none tracking-wide ${
                                      // See venue-showtimes.tsx: an alpha caps
                                      // achievable contrast on a light ground.
                                      exact ? "text-primary-ink" : "text-muted-foreground"
                                    }`}
                                  >
                                    {screening.format ?? "Standard"}
                                  </span>
                                </a>
                              );
                            })}
                            {venue.hiddenTimes > 0 ? (
                              <Link
                                to="/cinemas"
                                search={{ movie: filmSlug(film.title) }}
                                className="flex min-w-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-gold/40 px-3 py-2 text-gold transition-colors hover:border-gold/70 hover:bg-gold/5"
                                aria-label={`Show ${venue.hiddenTimes} more ${
                                  venue.hiddenTimes === 1 ? "time" : "times"
                                } for ${film.title} at ${venue.venue}`}
                              >
                                <span className="text-sm font-semibold leading-none">
                                  +{venue.hiddenTimes}
                                </span>
                                <span className="text-[10px] font-medium leading-none tracking-wide">
                                  more
                                </span>
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}

                      {/* The trim used to be silent, which is worse than the
                          trim: someone comparing us with the source saw four
                          screens where they knew there were fifty, with nothing
                          to say the rest were a click away. */}
                      {board.hiddenVenues > 0 ? (
                        <Link
                          to="/cinemas"
                          search={{ movie: filmSlug(film.title) }}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                        >
                          Showing {venues.length} of {board.totalVenues} screens — see all
                          <ChevronRight className="size-4" />
                        </Link>
                      ) : null}
                    </div>
                  ) : (
                    <p className="px-5 py-4 text-sm text-muted-foreground">
                      No more times here today.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}


      </main>

    </div>
  );
}

