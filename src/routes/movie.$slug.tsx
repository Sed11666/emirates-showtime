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

import { DAY_COUNT, buildDayOptions, toDayKey } from "@/lib/days";
import { bookingTarget } from "@/lib/venues";
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
  // Three days, matching DAY_COUNT and the scraper's SCRAPE_DAYS. This was
  // briefly collapsed to today alone when the database held one day; it holds
  // three now, so the picker is real again rather than decorative.
  const [day, setDay] = useState<string>(() => toDayKey(new Date()));
  const [language, setLanguage] = useState<string>("all");
  const [chain, setChain] = useState<string>("all");
  // Named cityFilter, not city: useUserLocation already returns a `city`, and
  // that one is where the visitor is rather than what they filtered to.
  const [cityFilter, setCityFilter] = useState<string>("all");
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
  const chains = [...new Set(matches.map((f) => f.cinema))].sort();
  const cities = [...new Set(matches.map((f) => f.city).filter(Boolean) as string[])].sort();

  const filteredFilms = useMemo(
    () =>
      matches.filter(
        (film) =>
          (language === "all" || film.language === language) &&
          (chain === "all" || film.cinema === chain) &&
          (cityFilter === "all" || film.city === cityFilter),
      ),
    [matches, language, chain, cityFilter],
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
            {/* Genre and certificate only. Language and runtime are carried by
                the spec line below, and the header sits beside the poster where
                a short label reads better than a full spec list. */}
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
                    value. The names stay for screen readers. */}
                <dl className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-muted-foreground">
                  {(
                    [
                      ["Genre", primary.genre],
                      [
                        languages.length === 1 ? "Language" : "Languages",
                        languages.length > 0 ? languages.join(", ") : null,
                      ],
                      ["Runtime", primary.duration_mins ? `${primary.duration_mins} mins` : null],
                      ["Rating", primary.rating],
                    ] as Array<[string, string | null]>
                  )
                    .filter((entry): entry is [string, string] => Boolean(entry[1]))
                    .map(([label, value], index) => (
                      <div key={label} className="flex items-center gap-2.5">
                        {index > 0 ? (
                          <span aria-hidden="true" className="text-muted-foreground/35">
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
              .filter((option) => option.value !== "any")
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
            {/* Only offered when the film actually plays at more than one chain
                or city — a filter with a single option is a control that cannot
                do anything. */}
            {chains.length > 1 ? (
              <FilterChip
                label={chain === "all" ? "All cinemas" : (CINEMA_LABELS[chain] ?? chain)}
                active={chain !== "all"}
                onClick={() =>
                  setChain((current) => {
                    const list = ["all", ...chains];
                    const index = list.indexOf(current);
                    return list[(index + 1) % list.length] ?? "all";
                  })
                }
              />
            ) : null}
            {cities.length > 1 ? (
              <FilterChip
                label={cityFilter === "all" ? "All cities" : cityFilter}
                active={cityFilter !== "all"}
                onClick={() =>
                  setCityFilter((current) => {
                    const list = ["all", ...cities];
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
                      href={
                        bookingTarget({
                          screeningUrl: screening.bookingUrl,
                          venueName: block.venue,
                          chain: block.cinema,
                          filmUrl: block.bookingUrl,
                        }) ?? "#"
                      }
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
