import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Clock, MapPin, RefreshCw, Search } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CINEMAS, CINEMA_LABELS, fetchCinemaFilms, showtimeList } from "@/lib/cinemas";
import { UAE_CITIES } from "@/lib/listings";

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
    return films.filter((film) => {
      if (cinema !== "all" && film.cinema !== cinema) return false;
      if (city !== "all" && (film.city ?? "").toLowerCase() !== city.toLowerCase()) return false;
      if (language !== "all" && film.language !== language) return false;
      if (term && !`${film.title} ${film.genre ?? ""} ${film.venues.join(" ")}`.toLowerCase().includes(term))
        return false;
      return true;
    });
  }, [films, search, cinema, city, language]);

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
          {filtered.map((film) => {
            const times = showtimeList(film.showtimes);
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
                    {film.rating && <Badge variant="outline">{film.rating}</Badge>}
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
