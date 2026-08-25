/**
 * Route "/movie/$slug" — BookMyShow-style movie detail / showtime picker.
 *
 * $slug comes from filmSlug(title). Because the same movie exists as separate
 * rows per chain, we gather every CinemaFilm sharing titleKey(), then build
 * VenueBlocks (lib/showtimes) sorted nearest-first using useUserLocation.
 * Filters: date (next 7 Dubai days), language, format, time-of-day.
 * Each time chip deep-links to that exact screening on the chain's own site.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  breadcrumbSchema,
  jsonLdDocument,
  movieSchema,
  screeningSchemas,
} from "@/lib/structured-data";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Heart, Info, Locate, SlidersHorizontal } from "lucide-react";

import { toDayKey } from "@/lib/days";
import {
  CINEMA_LABELS,
  fetchCinemaFilms,
  fetchFilmBySlug,
  filmFormats,
  filmSlug,
  titleKey,
  type CinemaFilm,
} from "@/lib/cinemas";
import { formatDistance, venueBlocks } from "@/lib/showtimes";
import { useUserLocation } from "@/hooks/useUserLocation";

export const Route = createFileRoute("/movie/$slug")({
  // Server-rendered: without this the page shipped an empty shell, the <h1>
  // fell back to the raw lowercase slug, and a crawler saw a title tag over no
  // content. Only this film's rows are serialised, so the payload is a few KB.
  loader: async ({ params }) => ({ films: await fetchFilmBySlug(params.slug) }),
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
    return {
      meta: [
        { title: `${name} Showtimes & Tickets in the UAE | ShowSouk` },
        {
          name: "description",
          content: `Cinema showtimes for ${name} across VOX, Star, Novo, Roxy, Reel, Cinema City and Cine Royal in the UAE, with the nearest screens to you listed first.`,
        },
        { property: "og:title", content: `${name} — Showtimes in the UAE` },
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

type TimeBand = "all" | "morning" | "evening";

function MovieShowtimesPage() {
  const { slug } = Route.useParams();
  // Today only. See the note in routes/cinemas.tsx: the database holds a single
  // day, so a date strip here rendered today's times under future dates.
  const day = toDayKey(new Date());
  const [language, setLanguage] = useState<string>("all");
  const [format, setFormat] = useState<string>("all");
  const [band, setBand] = useState<TimeBand>("all");
  const [favourites, setFavourites] = useState<string[]>([]);

  const { coords, city, precise, requestPrecise } = useUserLocation();
  useEffect(() => {
    if (!precise) requestPrecise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seeded from the loader so the server render already has the film. The
  // shared cinema-films query then supplies the full catalogue for everything
  // else on the page.
  const { films: ssrFilms } = Route.useLoaderData();
  const { data, isLoading } = useQuery({
    queryKey: ["cinema-films"],
    queryFn: fetchCinemaFilms,
    initialData: ssrFilms,
    initialDataUpdatedAt: 0,
  });

  /** Every chain's copy of this title. */
  const matches = useMemo<CinemaFilm[]>(
    () => (data ?? []).filter((film) => filmSlug(film.title) === slug),
    [data, slug],
  );

  const primary = matches[0];
  const languages = [...new Set(matches.map((f) => f.language).filter(Boolean) as string[])];
  const formats = [...new Set(matches.flatMap((f) => filmFormats(f)))];

  const filteredFilms = useMemo(
    () => matches.filter((film) => language === "all" || film.language === language),
    [matches, language],
  );

  const blocks = useMemo(() => {
    const rows = venueBlocks(filteredFilms, day, coords);
    return rows
      .map((block) => ({
        ...block,
        screenings: block.screenings.filter((screening) => {
          if (band === "morning" && screening.minutes >= 12 * 60) return false;
          if (band === "evening" && screening.minutes < 17 * 60) return false;
          if (format !== "all") {
            const label = (screening.format ?? "").toUpperCase();
            if (!label.includes(format)) return false;
          }
          return true;
        }),
      }))
      .filter((block) => block.screenings.length > 0);
  }, [filteredFilms, day, coords, band, format]);

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

  const toggleFavourite = (key: string) =>
    setFavourites((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

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
            <p className="truncate text-sm text-muted-foreground">
              {[primary?.genre, primary?.language, primary?.rating, primary?.duration_mins ? `${primary.duration_mins} mins` : null]
                .filter(Boolean)
                .join(", ") || "Now showing in UAE cinemas"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Date strip + filters ───────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-4 py-3">
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {/* Today's date, stated rather than chosen. The picker is gone until
                the data behind it exists — see routes/cinemas.tsx. */}
            <span className="flex shrink-0 items-center rounded-full bg-muted px-3 py-1 text-[11px] font-semibold tracking-widest text-muted-foreground">
              {todayLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" /> Filters
            </span>
            <span className="h-5 w-px bg-border" />
            {languages.length > 0 ? (
              <FilterChip
                label={language === "all" ? "All languages" : language}
                active={language !== "all"}
                onClick={() =>
                  setLanguage((current) => {
                    const list = ["all", ...languages];
                    const index = list.indexOf(current);
                    return list[(index + 1) % list.length] ?? "all";
                  })
                }
              />
            ) : null}
            {formats.map((option) => (
              <FilterChip
                key={option}
                label={option}
                active={format === option}
                onClick={() => setFormat((current) => (current === option ? "all" : option))}
              />
            ))}
            <FilterChip
              label="Morning"
              active={band === "morning"}
              onClick={() => setBand((current) => (current === "morning" ? "all" : "morning"))}
            />
            <FilterChip
              label="After 5 PM"
              active={band === "evening"}
              onClick={() => setBand((current) => (current === "evening" ? "all" : "evening"))}
            />
            {!precise ? (
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
        {/* ── Legend ───────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Info className="size-3.5" /> Nearest to {precise ? "you" : city} first
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-foreground" /> Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-gold" /> Filling fast
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" /> Almost full
          </span>
        </div>

        {isLoading ? <p className="text-muted-foreground">Loading showtimes…</p> : null}

        {!isLoading && blocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No screenings match these filters. Try another date or clear the filters.
          </p>
        ) : null}

        <div className="space-y-3">
          {blocks.map((block) => {
            const distance = formatDistance(block.distanceKm);
            const favourite = favourites.includes(block.key);
            return (
              <section
                key={block.key}
                className="grid gap-4 rounded-2xl border border-border/60 bg-card/40 p-4 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-background/60 text-[10px] font-bold uppercase tracking-wider text-gold">
                    {(CINEMA_LABELS[block.cinema] ?? block.cinema).slice(0, 4)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      <p className="font-semibold leading-snug">
                        {CINEMA_LABELS[block.cinema] ?? block.cinema}: {block.venue}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleFavourite(block.key)}
                        aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Heart className={`size-4 ${favourite ? "fill-primary text-primary" : ""}`} />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[distance, block.city].filter(Boolean).join(" · ") || "Distance unavailable"}
                    </p>
                    <p className="text-xs text-muted-foreground/70">Non-cancellable</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 sm:justify-start">
                  {block.screenings.map((screening) => (
                    <a
                      key={`${screening.time}-${screening.format ?? ""}`}
                      href={screening.bookingUrl ?? block.bookingUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-[6.25rem] flex-col items-center rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-center transition-colors hover:border-gold/60 hover:text-gold"
                    >
                      <span className="text-sm font-medium">{screening.time.toUpperCase()}</span>
                      {screening.format ? (
                        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {screening.format}
                        </span>
                      ) : null}
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/70 text-muted-foreground hover:border-gold/60 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
