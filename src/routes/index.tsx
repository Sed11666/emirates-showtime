import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Ticket } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListingCard } from "@/components/listing-card";
import { fetchListings, UAE_CITIES, type Listing } from "@/lib/listings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShowUAE — Book Movies & Events Across the Emirates" },
      {
        name: "description",
        content:
          "Discover and book cinema tickets, concerts and live events in Dubai, Abu Dhabi, Sharjah and across the UAE.",
      },
      { property: "og:title", content: "ShowUAE — Book Movies & Events Across the Emirates" },
      {
        property: "og:description",
        content: "Cinema, concerts and live experiences across the United Arab Emirates.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState<string>("All");
  const { data, isLoading } = useQuery({ queryKey: ["listings"], queryFn: () => fetchListings() });

  const listings = useMemo(() => {
    return (data ?? []).filter((l) => {
      const matchesCity = city === "All" || l.city === city;
      const matchesSearch = l.title.toLowerCase().includes(search.toLowerCase());
      return matchesCity && matchesSearch;
    });
  }, [data, city, search]);

  const featured = listings.filter((l) => l.featured);
  const movies = listings.filter((l) => l.kind === "movie");
  const events = listings.filter((l) => l.kind === "event");

  return (
    <div>
      <section className="bg-hero-gradient border-b border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/40 px-3 py-1 text-xs uppercase tracking-widest text-gold">
            <Ticket className="size-3.5" /> United Arab Emirates
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Every screen, stage and show in the{" "}
            <span className="text-gold-gradient">Emirates</span>
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Browse cinema releases and live events from Dubai to Fujairah — and publish your own
            listings in seconds.
          </p>

          <div className="mt-8 flex max-w-xl items-center gap-2 rounded-xl border border-border bg-card/80 p-2">
            <Search className="ml-2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search movies, concerts, festivals…"
              className="border-0 bg-transparent focus-visible:ring-0"
              aria-label="Search listings"
            />
            <Button asChild variant="hero" size="sm">
              <Link to="/admin">Add listing</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {["All", ...UAE_CITIES].map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  city === c
                    ? "border-gold bg-gold text-gold-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-14">
        {isLoading ? <p className="text-muted-foreground">Loading listings…</p> : null}

        {featured.length > 0 && (
          <Section title="Featured this week" items={featured} />
        )}
        <Section title="Now showing" items={movies} link="/movies" />
        <Section title="Live events" items={events} link="/events" />

        {!isLoading && listings.length === 0 && (
          <p className="text-muted-foreground">No listings match your filters yet.</p>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  items,
  link,
}: {
  title: string;
  items: Listing[];
  link?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-14">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        {link === "/movies" ? (
          <Link to="/movies" className="text-sm text-gold hover:underline">
            View all
          </Link>
        ) : null}
        {link === "/events" ? (
          <Link to="/events" className="text-sm text-gold hover:underline">
            View all
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {items.slice(0, 8).map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}
