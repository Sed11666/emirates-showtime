import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronRight, Clock, Film, MapPin, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoviePosterCard, filmToPoster, type PosterItem } from "@/components/movie-poster-card";
import { Reveal } from "@/components/reveal";
import { DaySelector } from "@/components/day-selector";
import { toDayKey } from "@/lib/days";
import {
  fetchCinemaFilms,
  filmFormats,
  mergeFilmsByTitle,
  showtimeList,
  showtimesByVenue,
  CINEMAS,
  CINEMA_LABELS,
  type MergedFilm,
} from "@/lib/cinemas";
import { VENUES } from "@/lib/venues";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShowSouk — Movies, Showtimes & Cinemas in the UAE" },
      {
        name: "description",
        content:
          "What's on across VOX, Reel, Novo and Roxy cinemas in Dubai, Abu Dhabi and the Emirates — now showing, today's showtimes and booking links in one place.",
      },
      { property: "og:title", content: "ShowSouk — Movies, Showtimes & Cinemas in the UAE" },
      {
        property: "og:description",
        content: "Today's showtimes across UAE cinema chains, updated daily.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

/** Popularity heuristic: playing at more chains, venues and times ranks higher. */
function popularityScore(film: MergedFilm) {
  const showtimes = Array.isArray(film.showtimes) ? film.showtimes.length : 0;
  return film.cinemas.length * 100 + film.venues.length * 10 + showtimes;
}

function Home() {
  const [query, setQuery] = useState("");
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));

  const { data: films } = useQuery({ queryKey: ["cinema-films"], queryFn: fetchCinemaFilms });

  const merged = useMemo(
    () => mergeFilmsByTitle(films ?? []).sort((a, b) => popularityScore(b) - popularityScore(a)),
    [films],
  );

  /** Top 4 most popular titles — the sliding hero cards. */
  const featured = useMemo(
    () => merged.filter((f) => f.poster_url?.startsWith("http")).slice(0, 4),
    [merged],
  );
  const featuredIds = new Set(featured.map((f) => f.id));

  /** Everything else goes into the Now Showing grid below. */
  const rest = useMemo<PosterItem[]>(
    () => merged.filter((f) => !featuredIds.has(f.id)).map(filmToPoster),
    [merged],
  );

  const showtimeBoard = useMemo(
    () =>
      merged
        .filter((f) => showtimeList(f.showtimes).length > 0)
        .slice(0, 6)
        .map((film) => ({
          film,
          venues: showtimesByVenue(film.showtimes, day, film.venues[0]),
        }))
        .filter((row) => row.venues.length > 0),
    [merged, day],
  );

  return (
    <div className="overflow-x-hidden">
      <HeroSlider films={featured} query={query} setQuery={setQuery} day={day} setDay={setDay} />

      {/* ── Now showing ─────────────────────────────────────── */}
      <SectionShell
        id="now-showing"
        eyebrow="In cinemas"
        title="Now Showing"
        subtitle="What's on across UAE cinemas this week"
        action={{ label: "All showtimes" }}
      >
        {rest.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {rest.map((item) => (
              <MoviePosterCard key={item.id} item={item} fullWidth />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Showtimes are updating…</p>
        )}
      </SectionShell>

      {/* ── Today's showtimes ───────────────────────────────── */}
      {showtimeBoard.length > 0 ? (
        <SectionShell
          eyebrow="Today's schedule"
          title="Today's Showtimes"
          subtitle="Quick look at what's playing tonight"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {showtimeBoard.map(({ film, venues }) => (
              <div
                key={film.id}
                className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Film className="size-4 shrink-0 text-gold" />
                    <p className="truncate font-display text-sm font-bold uppercase tracking-wide">
                      {film.title}
                    </p>
                    {film.rating ? (
                      <span className="shrink-0 rounded-md border border-gold/50 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                        {film.rating}
                      </span>
                    ) : null}
                  </div>
                  <Link
                    to="/cinemas"
                    search={{ movie: film.title }}
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-gold hover:brightness-125"
                  >
                    All times <ChevronRight className="size-3.5" />
                  </Link>
                </div>

                <div className="mt-4 space-y-4">
                  {venues.map((venue) => (
                    <div key={venue.venue}>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3.5 text-primary" /> {venue.venue}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {venue.times.map((time) => (
                          <Link
                            key={time}
                            to="/cinemas"
                            search={{ movie: film.title }}
                            className="rounded-lg border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs transition-colors hover:border-gold/60 hover:text-gold"
                          >
                            {time}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionShell>
      ) : null}

      {/* ── Cinema chains ───────────────────────────────────── */}
      <SectionShell eyebrow="UAE cinema chains" title="Book by Cinema">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CINEMAS.map((chain) => {
            const locations = VENUES.filter((v) => v.cinema === chain.key).length;
            return (
              <Link
                key={chain.key}
                to="/cinemas"
                search={{}}
                className="group rounded-2xl border border-border/60 bg-card/50 px-5 py-7 text-center transition-all hover:-translate-y-1 hover:border-gold/50 hover:gold-glow"
              >
                <p className="font-display text-sm font-bold uppercase tracking-wide">
                  {CINEMA_LABELS[chain.key]}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{locations} locations</p>
              </Link>
            );
          })}
        </div>
      </SectionShell>

      {/* ── Never miss a showtime ───────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <Reveal>
          <div className="film-grain relative overflow-hidden rounded-3xl border border-gold/25">
            <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_10%_0%,oklch(0.4_0.16_285)_0%,oklch(0.2_0.03_280)_55%,oklch(0.16_0.015_280)_100%)]" />
            <div className="relative px-7 py-14 sm:px-14">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-gold">
                <Bell className="size-3.5" /> Stay updated
              </p>
              <h2 className="mt-4 max-w-xl font-display text-3xl font-extrabold uppercase leading-tight sm:text-4xl">
                Never miss a showtime
              </h2>
              <p className="mt-4 max-w-lg text-sm text-muted-foreground">
                Get notified when your favourite movies hit UAE cinemas. Showtimes, trailers and
                booking links — all in one place.
              </p>
              <div className="mt-7 max-w-sm space-y-3">
                <Input placeholder="Your email address" aria-label="Your email address" />
                <Button asChild variant="gold" className="w-full">
                  <Link to="/auth">Notify Me</Link>
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Free. No spam. Unsubscribe anytime.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/** Full-bleed hero: the top 4 popular movies slide through automatically. */
function HeroSlider({
  films,
  query,
  setQuery,
  day,
  setDay,
}: {
  films: MergedFilm[];
  query: string;
  setQuery: (v: string) => void;
  day: string;
  setDay: (v: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (films.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % films.length), 6000);
    return () => window.clearInterval(id);
  }, [films.length]);

  const active = films[index % Math.max(films.length, 1)];

  return (
    <section className="film-grain relative isolate min-h-[78vh] overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10">
        {films.map((film, i) => (
          <img
            key={film.id}
            src={film.poster_url ?? ""}
            alt=""
            className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.13_0.02_280/0.55)_0%,oklch(0.15_0.02_280/0.82)_45%,oklch(0.155_0.015_280)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(85%_75%_at_20%_30%,oklch(0.13_0.015_280/0.75)_0%,transparent_75%)]" />
        {films.length === 0 ? <div className="absolute inset-0 bg-hero-gradient" /> : null}
      </div>

      <div className="relative mx-auto flex min-h-[78vh] max-w-7xl flex-col justify-end px-4 pb-14 pt-28">
        {active ? (
          <>
            <div className="flex flex-wrap gap-2">
              {[active.genre, active.language].filter(Boolean).map((chip) => (
                <span
                  key={chip as string}
                  className="rounded-md border border-gold/40 bg-background/50 px-2.5 py-1 text-[11px] uppercase tracking-wider text-gold backdrop-blur"
                >
                  {chip}
                </span>
              ))}
              {filmFormats(active)
                .slice(0, 2)
                .map((format) => (
                  <span
                    key={format}
                    className="rounded-md border border-gold/40 bg-background/50 px-2.5 py-1 text-[11px] uppercase tracking-wider text-gold backdrop-blur"
                  >
                    {format}
                  </span>
                ))}
            </div>

            <h1 className="mt-5 max-w-4xl font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-7xl">
              {active.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {active.rating ? (
                <span className="inline-flex items-center gap-1.5 text-gold">
                  <Star className="size-4 fill-gold text-gold" /> {active.rating}
                </span>
              ) : null}
              {active.duration_mins ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" /> {Math.floor(active.duration_mins / 60)}h{" "}
                  {active.duration_mins % 60}m
                </span>
              ) : null}
              <span>Now Showing in UAE</span>
            </div>

            <Button asChild variant="gold" size="lg" className="mt-7 w-fit">
              <Link to="/cinemas" search={{ movie: active.title }}>
                Get Showtimes <ChevronRight className="size-4" />
              </Link>
            </Button>
          </>
        ) : (
          <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.95] sm:text-7xl">
            ShowSouk
          </h1>
        )}

        <div className="mt-9 flex max-w-2xl items-center gap-2 rounded-2xl border border-border/70 bg-card/70 p-2 backdrop-blur-xl">
          <Search className="ml-2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                navigate({ to: "/search", search: { q: query.trim(), tab: "all" } });
              }
            }}
            placeholder="Search movies, cinemas, or locations"
            className="border-0 bg-transparent focus-visible:ring-0"
            aria-label="Search ShowSouk"
          />
          <Button asChild variant="gold" size="sm">
            <Link to="/search" search={{ q: query, tab: "all" as const }}>
              Search
            </Link>
          </Button>
        </div>

        {films.length > 1 ? (
          <div className="mt-6 flex gap-2">
            {films.map((film, i) => (
              <button
                key={film.id}
                onClick={() => setIndex(i)}
                aria-label={`Show ${film.title}`}
                className={`h-1 rounded-full transition-all ${
                  i === index ? "w-8 bg-gold" : "w-4 bg-border hover:bg-muted-foreground"
                }`}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-7 max-w-3xl rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur-xl">
          <p className="mb-3 text-sm font-medium">Show me what&apos;s on</p>
          <DaySelector value={day} onChange={setDay} />
        </div>
      </div>
    </section>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  subtitle,
  action,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: { label: string };
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-14 sm:py-20">
      <Reveal>
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold">{eyebrow}</p>
              <h2 className="mt-2 font-display text-3xl font-extrabold uppercase sm:text-4xl">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {action ? (
              <Link
                to="/cinemas"
                search={{}}
                className="group inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
              >
                {action.label}
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : null}
          </div>
          <div className="gold-rule mb-8 h-px" />
          {children}
        </div>
      </Reveal>
    </section>
  );
}
