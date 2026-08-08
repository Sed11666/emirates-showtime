import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Search, Ticket } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListingCard } from "@/components/listing-card";
import { MovieMarquee } from "@/components/movie-marquee";
import { MoviePosterCard, filmToPoster, type PosterItem } from "@/components/movie-poster-card";
import { Reveal } from "@/components/reveal";
import { fetchListings, UAE_CITIES, type Listing } from "@/lib/listings";
import { fetchCinemaFilms, showtimeList, CINEMAS, CINEMA_LABELS } from "@/lib/cinemas";
import { fetchLiveEvents, formatEventDate, EVENT_SOURCE_LABELS } from "@/lib/live-events";
import { DaySelector } from "@/components/day-selector";
import { toDayKey } from "@/lib/days";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShowSouk — Movies, Cinemas & Live Events in the UAE" },
      {
        name: "description",
        content:
          "Book cinema tickets and live events across Dubai, Abu Dhabi and the Emirates. Now showing, coming soon and arena shows in one premium ticketing platform.",
      },
      { property: "og:title", content: "ShowSouk — Movies, Cinemas & Live Events in the UAE" },
      {
        property: "og:description",
        content: "A cinematic way to discover what's playing tonight across the Emirates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState<string>("All");
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));

  const { data: listings } = useQuery({ queryKey: ["listings"], queryFn: () => fetchListings() });
  const { data: films } = useQuery({ queryKey: ["cinema-films"], queryFn: fetchCinemaFilms });
  const { data: liveEvents } = useQuery({ queryKey: ["live-events"], queryFn: fetchLiveEvents });

  const filteredListings = useMemo(() => {
    return (listings ?? []).filter((l) => {
      const matchesCity = city === "All" || l.city === city;
      const matchesSearch = l.title.toLowerCase().includes(search.toLowerCase());
      const matchesDay = day === "any" || !l.starts_at || toDayKey(new Date(l.starts_at)) === day;
      return matchesCity && matchesSearch && matchesDay;
    });
  }, [listings, city, search, day]);

  const withPosters = useMemo(
    () => (films ?? []).filter((f) => f.poster_url?.startsWith("http")),
    [films],
  );

  const matchesQuery = (title: string, filmCity: string | null) =>
    title.toLowerCase().includes(search.toLowerCase()) && (city === "All" || filmCity === city);

  const nowShowing = useMemo<PosterItem[]>(
    () =>
      withPosters
        .filter((f) => showtimeList(f.showtimes).length > 0 && matchesQuery(f.title, f.city))
        .map(filmToPoster),
    [withPosters, search, city],
  );

  const comingSoon = useMemo<PosterItem[]>(
    () =>
      withPosters
        .filter((f) => showtimeList(f.showtimes).length === 0 && matchesQuery(f.title, f.city))
        .map(filmToPoster),
    [withPosters, search, city],
  );

  const popular = useMemo<PosterItem[]>(() => {
    const pool = nowShowing.length > 0 ? nowShowing : withPosters.map(filmToPoster);
    return pool.slice(0, 12);
  }, [nowShowing, withPosters]);

  const reelItems = nowShowing.length > 0 ? nowShowing : withPosters.map(filmToPoster);
  const heroPosters = reelItems.slice(0, 14).map((p) => p.poster).filter(Boolean) as string[];

  const movies = filteredListings.filter((l) => l.kind === "movie");
  const events = filteredListings.filter((l) => l.kind === "event");
  const arenaEvents = (liveEvents ?? []).slice(0, 6);

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section id="discover" className="film-grain relative isolate overflow-hidden">
        <HeroBackdrop posters={heroPosters} />

        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-24 sm:pt-32">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-background/50 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-primary backdrop-blur">
            <Ticket className="size-3.5" /> United Arab Emirates
          </p>
          <h1 className="mt-6 max-w-4xl text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
            The house lights are down.
            <br />
            <span className="text-gold-gradient">Your seat is waiting.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Every screen, stage and showtime across the Emirates — now showing, coming soon and on
            sale tonight.
          </p>

          <div className="mt-9 flex max-w-2xl items-center gap-2 rounded-2xl border border-border/70 bg-card/70 p-2 backdrop-blur-xl">
            <Search className="ml-2 size-4 text-primary" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search movies, concerts, arenas…"
              className="border-0 bg-transparent focus-visible:ring-0"
              aria-label="Search listings"
            />
            <Button asChild variant="hero" size="sm">
              <Link to="/cinemas">Explore</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {["All", ...UAE_CITIES].map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition-all ${
                  city === c
                    ? "border-primary bg-primary text-primary-foreground red-glow"
                    : "border-border/70 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mt-7 max-w-3xl rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur-xl">
            <p className="mb-3 text-sm font-medium">Show me what&apos;s on</p>
            <DaySelector value={day} onChange={setDay} />
          </div>
        </div>
      </section>

      {/* ── Now showing marquee ────────────────────────────── */}
      <SectionShell
        id="now-showing"
        eyebrow="In cinemas tonight"
        title="Now Showing"
        action={{ to: "/cinemas", label: "All showtimes" }}
        bleed
      >
        {reelItems.length > 0 ? (
          <MovieMarquee items={reelItems} duration={90} size="lg" />
        ) : (
          <p className="px-4 text-muted-foreground">Loading the reel…</p>
        )}
      </SectionShell>

      {/* ── Popular ────────────────────────────────────────── */}
      <SectionShell
        eyebrow="Trending across the Emirates"
        title="Popular Movies"
        action={{ to: "/cinemas", label: "View all" }}
      >
        <div className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {popular.map((item) => (
            <MoviePosterCard key={item.id} item={item} />
          ))}
        </div>
      </SectionShell>

      {/* ── Coming soon ────────────────────────────────────── */}
      {comingSoon.length > 0 ? (
        <SectionShell id="coming-soon" eyebrow="Book ahead" title="Coming Soon" bleed>
          <MovieMarquee items={comingSoon} duration={110} size="md" />
        </SectionShell>
      ) : null}

      {/* ── Cinema discovery ───────────────────────────────── */}
      <SectionShell eyebrow="Where to watch" title="Book Tickets by Cinema">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CINEMAS.map((chain) => {
            const count = (films ?? []).filter((f) => f.cinema === chain.key).length;
            return (
              <Link
                key={chain.key}
                to="/cinemas"
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6 transition-all hover:-translate-y-1 hover:border-primary/60 hover:red-glow"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <p className="font-display text-lg font-bold">{chain.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {count > 0 ? `${count} films playing` : "Showtimes updating"}
                </p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary">
                  Browse <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </SectionShell>

      {/* ── Upcoming events ────────────────────────────────── */}
      {arenaEvents.length > 0 ? (
        <SectionShell
          eyebrow="Live at the arenas"
          title="Upcoming Events"
          action={{ to: "/events", label: "All events" }}
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {arenaEvents.map((event) => (
              <a
                key={event.id}
                href={event.ticket_url ?? event.source_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-poster transition-all hover:-translate-y-1 hover:border-primary/60 hover:red-glow"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                  {event.image_url ? (
                    <img
                      src={event.image_url}
                      alt={`${event.title} artwork`}
                      loading="lazy"
                      className="size-full object-cover opacity-85 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                </div>
                <div className="space-y-1.5 p-5">
                  <p className="text-[11px] uppercase tracking-widest text-primary">
                    {EVENT_SOURCE_LABELS[event.source] ?? event.venue}
                  </p>
                  <h3 className="line-clamp-1 text-base font-semibold">{event.title}</h3>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {formatEventDate(event)}
                  </p>
                  <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 text-primary" /> {event.city ?? "UAE"}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </SectionShell>
      ) : null}

      {/* ── Listings from ShowSouk ─────────────────────────── */}
      {movies.length + events.length > 0 ? (
        <SectionShell eyebrow="Curated on ShowSouk" title="Handpicked This Week">
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {[...movies, ...events].slice(0, 8).map((l: Listing) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </SectionShell>
      ) : null}

      {/* ── Promo banner ───────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <Reveal>
          <div className="film-grain relative overflow-hidden rounded-3xl border border-primary/30 bg-[radial-gradient(120%_140%_at_10%_0%,oklch(0.32_0.13_25)_0%,oklch(0.15_0.02_20)_60%)] px-8 py-14 sm:px-14">
            <div className="relative max-w-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary">
                ShowSouk members
              </p>
              <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">
                Front-row alerts before the box office opens.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Create a free account to follow cinemas near you and get notified the moment tickets
                drop for {CINEMA_LABELS["vox"]}, arenas and festivals.
              </p>
              <Button asChild variant="hero" size="lg" className="mt-7">
                <Link to="/auth">Create free account</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/** Cinematic hero backdrop: drifting posters under heavy red-lit darkness. */
function HeroBackdrop({ posters }: { posters: string[] }) {
  if (posters.length === 0) {
    return <div className="absolute inset-0 -z-10 bg-hero-gradient" />;
  }
  const row = [...posters, ...posters];
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 flex flex-col justify-center gap-4 opacity-[0.35]">
        {[0, 1].map((r) => (
          <div
            key={r}
            className="marquee-track gap-4"
            style={{ animationDuration: r === 0 ? "120s" : "170s" }}
          >
            {[...row, ...row].map((src, i) => (
              <img
                key={`${r}-${i}`}
                src={src}
                alt=""
                loading="lazy"
                className="h-56 w-40 shrink-0 rounded-xl object-cover sm:h-72 sm:w-52"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.1_0.01_20/0.92)_0%,oklch(0.13_0.03_22/0.9)_50%,oklch(0.14_0.012_20)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_20%_10%,oklch(0.45_0.2_25/0.35)_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_45%,transparent_10%,oklch(0.08_0.01_20/0.75)_85%)]" />
      <div className="absolute inset-0 backdrop-blur-[3px]" />
    </div>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  action,
  bleed,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  action?: { to: string; label: string };
  bleed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-14 sm:py-20">
      <Reveal>
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">{title}</h2>
            </div>
            {action ? (
              <Link
                to={action.to}
                className="group inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {action.label}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : null}
          </div>
          <div className="mb-8 h-px bg-gradient-to-r from-primary/60 via-border/40 to-transparent" />
        </div>
        <div className={bleed ? "" : "mx-auto max-w-7xl px-4"}>{children}</div>
      </Reveal>
    </section>
  );
}
