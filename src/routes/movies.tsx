import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListingCard } from "@/components/listing-card";
import { fetchListings } from "@/lib/listings";

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

  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-bold">Movies in the UAE</h1>
      <p className="mt-2 text-muted-foreground">Now showing and coming soon across the Emirates.</p>
      <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">
        {(data ?? []).map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
      {!isLoading && (data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No movies listed yet.</p>
      ) : null}
    </main>
  );
}
