/**
 * Route "/cinemas" — Browse scraped films by chain, city, day and venue.
 *
 * Includes the "Cinemas near you" panel (browser geolocation -> nearestVenues)
 * and nearest-to-farthest ordering. Search + day selector filter the same
 * `cinema_films` dataset the home page uses.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Clock, Locate, MapPin, Navigation, RefreshCw, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DaySelector } from "@/components/day-selector";
import {
  CINEMAS,
  CINEMA_LABELS,
  fetchCinemaFilms,
  hasDatedShowtimes,
  showtimesForDay,
} from "@/lib/cinemas";
import {
  filmDistanceKm,
  matchesVenues,
  nearestVenues,
  type Coords,
  type NearbyVenue,
} from "@/lib/venues";
import { UAE_CITIES } from "@/lib/listings";
import { toDayKey } from "@/lib/days";

export const Route = createFileRoute("/cinemas")({
  head: () => ({

    meta: [
      { title: "UAE Cinema Showtimes — VOX, Reel, Novo & Roxy | ShowSouk" },
      {
        name: "description",
        content:
          "Filtered now-showing listings from VOX, Reel, Novo and Roxy cinemas across the UAE, refreshed automatically every three hours.",
      },
      { property: "og:title", content: "UAE Cinema Showtimes — VOX, Reel, Novo & Roxy" },
      {
        property: "og:description",
        content:
          "Browse films now showing at VOX, Reel, Novo and Roxy cinemas in Dubai, Abu Dhabi and across the Emirates.",
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
  const [search, setSearch] = useState("");
  const [cinema, setCinema] = useState<string>("all");
  const [city, setCity] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));
  const [nearby, setNearby] = useState<NearbyVenue[] | null>(null);
  const [nearOnly, setNearOnly] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied">("idle");




  const requestLocation = (filterToNearby = true) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("denied");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        const venues = nearestVenues(point);
        setCoords(point);
        setNearby(venues);
        setNearOnly(filterToNearby);
        setGeoState("idle");
        if (filterToNearby && venues[0]) setCity(venues[0].city);
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
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
    return films
      .filter((film) => {
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
      })
      .map((film) => ({
        film,
        times: showtimesForDay(film.showtimes, day),
        distance: coords ? filmDistanceKm(film.cinema, film.venues, coords) : null,
      }))
      // Nearest screens first once we know where the visitor is.
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [films, search, cinema, city, language, day, nearOnly, nearby, coords]);



  const lastUpdated = films.reduce<string | null>(
    (latest, film) => (!latest || film.last_seen_at > latest ? film.last_seen_at : latest),
    null,
  );

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">

        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Now showing</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">UAE Cinema Showtimes</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Live listings pulled from VOX, Reel, Novo and Roxy. The scraper runs automatically every
            three hours and only updates what has changed.
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            {lastUpdated && <span>Last refreshed {new Date(lastUpdated).toLocaleString("en-AE")}</span>}
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Reload
            </Button>
          </div>
        </header>

        <section className="mb-6 rounded-xl border border-border/70 bg-card/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Navigation className="size-4 text-primary" /> Cinemas near you
              </h2>
              <p className="text-xs text-muted-foreground">
                {nearby
                  ? "Suggested chains based on your current location."
                  : "Share your location to see the closest VOX, Reel, Novo and Roxy screens."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => requestLocation()} disabled={geoState === "loading"}>
                <Locate className={`size-3.5 ${geoState === "loading" ? "animate-pulse" : ""}`} />
                {nearby ? "Update location" : "Use my location"}
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
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {nearby.map((venue) => (
                <li
                  key={`${venue.cinema}-${venue.name}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{venue.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {CINEMA_LABELS[venue.cinema]} · {venue.city}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCinema(venue.cinema);
                      setCity(venue.city);
                    }}
                    className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                  >
                    {venue.distanceKm < 1
                      ? `${Math.round(venue.distanceKm * 1000)} m`
                      : `${venue.distanceKm.toFixed(1)} km`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>


        <div className="mb-6 space-y-4 rounded-xl border border-border/70 bg-card/50 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search film, genre or venue"
              className="pl-9"
            />
          </div>

          <DaySelector value={day} onChange={setDay} />

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

        {isLoading && <p className="text-muted-foreground">Loading showtimes…</p>}
        {error && <p className="text-destructive">Could not load showtimes. Please try again.</p>}
        {!isLoading && !error && filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No films match these filters yet. The next scheduled scrape will fill this in.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ film, times, distance }) => {
            return (
              <article
                key={film.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card"
              >
                {film.poster_url ? (
                  <img
                    src={film.poster_url}
                    alt={`${film.title} poster`}
                    loading="lazy"
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-56 w-full items-center justify-center bg-muted">
                    <Clapperboard className="size-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{CINEMA_LABELS[film.cinema] ?? film.cinema}</Badge>
                    <div className="flex items-center gap-2">
                      {distance !== null && (
                        <Badge variant="outline" className="text-primary">
                          {distance < 1
                            ? `${Math.round(distance * 1000)} m`
                            : `${distance.toFixed(1)} km`}
                        </Badge>
                      )}
                      {film.rating && <Badge variant="outline">{film.rating}</Badge>}
                    </div>
                  </div>
                  <h2 className="font-display text-lg font-semibold leading-tight">{film.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[film.genre, film.language].filter(Boolean).join(" · ")}
                  </p>
                  {film.synopsis && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{film.synopsis}</p>
                  )}
                  <div className="mt-auto space-y-2 pt-2 text-xs text-muted-foreground">
                    {film.duration_mins && (
                      <p className="flex items-center gap-1.5">
                        <Clock className="size-3.5" /> {film.duration_mins} mins
                      </p>
                    )}
                    {(film.city || film.venues.length > 0) && (
                      <p className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" />
                        <span className="line-clamp-2">
                          {[film.city, film.venues.slice(0, 3).join(", ")].filter(Boolean).join(" — ")}
                        </span>
                      </p>
                    )}
                    {times.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {times.map((time, index) => (
                          <span
                            key={`${time}-${index}`}
                            className="rounded bg-muted px-2 py-1 text-[11px]"
                          >
                            {time}
                          </span>
                        ))}

                      </div>
                    )}
                    {(film.booking_url || film.source_url) && (
                      <a
                        href={film.booking_url ?? film.source_url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-primary underline-offset-4 hover:underline"
                      >
                        Book on {CINEMA_LABELS[film.cinema] ?? film.cinema}
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

    </div>
  );
}

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
  const all = [{ value: "all", label: `All ${label.toLowerCase()}s` }, ...options];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {all.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            value === option.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
