import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Film } from "lucide-react";
import { ListingCard } from "@/components/listing-card";
import { PosterReel } from "@/components/poster-reel";
import { fetchListings } from "@/lib/listings";
import { fetchCinemaFilms } from "@/lib/cinemas";


export const Route = createFileRoute("/movies")({
  head: () => ({
    meta: [
      { title: "Movies Now Showing in the UAE | ShowSouk" },
      {
        name: "description",
        content:
          "Cinema listings across Dubai, Abu Dhabi and Sharjah — showtimes, languages, certifications and ticket prices in AED.",
      },
      { property: "og:title", content: "Movies Now Showing in the UAE | ShowSouk" },
      {
        property: "og:description",
        content: "Browse every film playing across UAE cinemas this week.",
      },
    ],
  }),
  component: MoviesPage,
});

function MoviesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["listings", "movie"],
    queryFn: () => fetchListings("movie"),
  });
  const { data: cinemaFilms } = useQuery({
    queryKey: ["cinema-films"],
    queryFn: fetchCinemaFilms,
  });

  const posters = useMemo(() => {
    const urls = [
      ...(cinemaFilms ?? []).map((f) => f.poster_url),
      ...(data ?? []).map((l) => l.poster_url),
    ].filter((u): u is string => Boolean(u && u.startsWith("http")));
    return [...new Set(urls)].slice(0, 24);
  }, [cinemaFilms, data]);

  return (
    <main>
      <section className="relative isolate overflow-hidden border-b border-border/50">
        <PosterReel posters={posters} />
        <div className="relative mx-auto max-w-6xl px-4 py-28 sm:py-40">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-background/40 px-3 py-1 text-xs uppercase tracking-widest text-gold backdrop-blur">
            <Film className="size-3.5" /> Now in cinemas
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Movies in the <span className="text-gold-gradient">UAE</span>
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Now showing and coming soon across the Emirates — an endless reel of releases from
            Dubai to Fujairah.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {(data ?? []).map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
        {!isLoading && (data ?? []).length === 0 ? (
          <p className="text-muted-foreground">No movies listed yet.</p>
        ) : null}
      </div>
    </main>
  );

}
