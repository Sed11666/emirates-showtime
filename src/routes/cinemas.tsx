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
import { ChevronRight, Film, Locate, MapPin, Navigation, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DaySelector } from "@/components/day-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  CINEMAS,
  CINEMA_LABELS,
  fetchCinemaFilms,
  filmSlug,
  hasDatedShowtimes,
  mergeFilmsByTitle,
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
} from "@/lib/venues";
import { useUserLocation } from "@/hooks/useUserLocation";
import { UAE_CITIES } from "@/lib/listings";
import { toDayKey } from "@/lib/days";

export const Route = createFileRoute("/cinemas")({
  /**
   * `?movie=<filmSlug>` scopes the page to one title, which is how a movie card
   * anywhere on the site opens its details and times here. Every other filter
   * is deliberately local state — this one is in the URL because it has to be
   * linkable and survive a refresh or a share.
   */
  validateSearch: (search: Record<string, unknown>): { movie?: string } => {
    const movie = typeof search["movie"] === "string" ? search["movie"].trim() : "";
    return movie ? { movie } : {};
  },
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
      { property: "og:url", content: "/cinemas" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/cinemas" }],
  }),
  component: CinemasPage,
});

function CinemasPage() {
  const { movie: movieSlug } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [cinema, setCinema] = useState<string>("all");
  const [city, setCity] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));
  const [nearOnly, setNearOnly] = useState(false);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied">("idle");

  // Shared visitor position: precise browser coords when granted, otherwise the
  // centre of the header city. Ask once on mount so the panel fills itself in.
  const { coords, precise, requestPrecise } = useUserLocation();

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

  /** Six closest screens to the visitor, nearest first. */
  const nearby = useMemo<NearbyVenue[] | null>(
    () => (coords ? nearestVenues(coords, 6) : null),
    [coords],
  );

  const requestLocation = (filterToNearby = true) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("denied");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        window.localStorage.setItem("showsouk:coords", JSON.stringify(point));
        requestPrecise();
        const venues = nearestVenues(point, 6);
        setNearOnly(filterToNearby);
        setGeoState("idle");
        if (filterToNearby && venues[0]) setCity(venues[0].city);
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };


  const { data, isLoading, error } = useQuery({
    queryKey: ["cinema-films"],
    queryFn: fetchCinemaFilms,
  });

  const films = useMemo(() => data ?? [], [data]);

  const languages = useMemo(
    () => [...new Set(films.map((f) => f.language).filter(Boolean) as string[])].sort(),
    [films],
  );

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
      if (term && !`${film.title} ${film.genre ?? ""} ${film.venues.join(" ")}`.toLowerCase().includes(term))
        return false;
      if (nearOnly && nearby && nearby.length > 0) {
        const nearChains = new Set(nearby.map((v) => v.cinema as string));
        if (!nearChains.has(film.cinema)) return false;
        if (film.venues.length > 0 && !matchesVenues(film.venues, nearby)) return false;
      }
      if (day !== "any" && hasDatedShowtimes(film.showtimes)) {
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

    // One card per movie, nearest first.
    return mergeFilmsByTitle(matching)
      .map((film) => ({ film, distance: distanceByTitle.get(titleKey(film.title)) ?? null }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [films, movieSlug, search, cinema, city, language, day, nearOnly, nearby, coords]);

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




  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">

        {/* Says what the visitor gets, not how we get it. How often our scraper
            runs and when it last succeeded are our concerns, not theirs. */}
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Now showing</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">UAE Cinema Showtimes</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Today&rsquo;s screenings at every major cinema across the Emirates. Pick a time to book
            with the cinema directly.
          </p>
        </header>

        <section className="mb-6 rounded-xl border border-border/70 bg-card/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Navigation className="size-4 text-primary" /> Cinemas near you
              </h2>
              <p className="text-xs text-muted-foreground">
                {precise
                  ? "The 6 closest screens to your current location."
                  : "The 6 closest screens to your selected city — share your location for exact distances."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => requestLocation()} disabled={geoState === "loading"}>
                <Locate className={`size-3.5 ${geoState === "loading" ? "animate-pulse" : ""}`} />
                {precise ? "Update location" : "Use my location"}
              </Button>

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

          {geoState === "denied" && (
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
                    <p className="truncate font-display text-sm font-bold uppercase tracking-wide">
                      {venue.name}
                    </p>
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      {CINEMA_LABELS[venue.cinema]} · {venue.city}
                    </p>
                    <p className="mt-1 text-xs text-gold">
                      {venue.distanceKm < 1
                        ? `${Math.round(venue.distanceKm * 1000)} m away`
                        : `${venue.distanceKm.toFixed(1)} km away`}
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

          <DaySelector value={day} onChange={setDay} />

          {/* Side by side on anything wider than a phone: three dropdowns cost
              one row, where the old pills cost three wrapping rows. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FilterRow
              label="Cinema"
              value={cinema}
              onChange={setCinema}
              options={CINEMAS.map((c) => ({ value: c.key, label: c.label }))}
            />
            <FilterRow
              label="City"
              value={city}
              onChange={setCity}
              options={UAE_CITIES.map((c) => ({ value: c, label: c }))}
            />
            {languages.length > 0 && (
              <FilterRow
                label="Language"
                value={language}
                onChange={setLanguage}
                options={languages.map((l) => ({ value: l, label: l }))}
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
              ? `No screenings for ${scopedTitle} on the selected day. Try another day, or show all films.`
              : "No films match these filters yet. The next scheduled scrape will fill this in."}
          </p>
        )}

        {/* Same showtimes-board treatment as the home page. */}
        <div className="space-y-5">
          {filtered.map(({ film, distance }) => {
            // Scoped to one film: list every screen. Browsing all films: trim,
            // or the page becomes thousands of rows.
            const venues = showtimesByVenue(
              film.showtimes,
              day === "any" ? toDayKey(new Date()) : day,
              film.venues[0],
              movieSlug ? undefined : { maxVenues: 4, maxTimesPerVenue: 8 },
            )
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
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Film className="size-4 shrink-0 text-gold" />
                    <p className="truncate font-display text-base font-bold uppercase tracking-wide">
                      {film.title}
                    </p>
                    {film.rating ? (
                      <span className="shrink-0 rounded-md border border-gold/50 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                        {film.rating}
                      </span>
                    ) : null}
                    {distance !== null ? (
                      <span className="shrink-0 rounded-md border border-gold/40 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                        {distance < 1
                          ? `${Math.round(distance * 1000)} m`
                          : `${distance.toFixed(1)} km`}
                      </span>
                    ) : null}
                  </div>
                  {/* Stays inside Cinemas: scoping this page to the film shows
                      every screen, which is what the old movie page was for. */}
                  {!movieSlug ? (
                    <Link
                      to="/cinemas"
                      search={{ movie: filmSlug(film.title) }}
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-gold hover:brightness-125"
                    >
                      All times <ChevronRight className="size-3.5" />
                    </Link>
                  ) : null}
                </div>

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
                          {venue.km !== null ? (
                            <span className="text-xs text-muted-foreground">
                              {venue.km < 1
                                ? `${Math.round(venue.km * 1000)} m away`
                                : `${venue.km.toFixed(1)} km away`}
                            </span>
                          ) : null}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {venue.times.length} {venue.times.length === 1 ? "show" : "shows"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          {venue.times.map((screening) => {
                            // Straight out to the chain — no interstitial page.
                            // Per-screening deep link where the chain exposes
                            // one, else the film's page on that chain, else the
                            // chain itself. Never construct a booking URL.
                            const href = screening.bookingUrl ?? filmFallback;
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
                                    ? "border border-border/70 bg-background/60 hover:border-primary/70 hover:bg-primary/5"
                                    : "border border-dashed border-border/60 bg-transparent hover:border-border hover:bg-muted/30"
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
                                    exact ? "text-primary" : "text-muted-foreground/70"
                                  }`}
                                >
                                  {screening.format ?? "Standard"}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-4 text-sm text-muted-foreground">
                    No listed times for this day yet.
                  </p>
                )}
              </div>
            );
          })}
        </div>


      </main>

    </div>
  );
}

/**
 * One filter as a dropdown. These were rows of pills, which worked when there
 * were four chains and grew unusable at seven chains and eight emirates: three
 * wrapping rows of buttons above the results, pushing the films off-screen on a
 * phone. A dropdown stays one line whatever the option count.
 *
 * The date picker is deliberately still a row — you scan a week at a glance and
 * pick a day, which is browsing rather than filtering.
 */
function FilterRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const allLabel = `All ${label.toLowerCase()}s`;
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full min-w-[9rem] text-sm">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
