import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListingCard } from "@/components/listing-card";
import { fetchListings } from "@/lib/listings";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Concerts & Live Events in the UAE | ShowSouk" },
      {
        name: "description",
        content:
          "Concerts, comedy, festivals and cultural events across Dubai, Abu Dhabi, Sharjah and the Northern Emirates.",
      },
      { property: "og:title", content: "Concerts & Live Events in the UAE | ShowSouk" },
      {
        property: "og:description",
        content: "Find and book live experiences happening across the Emirates.",
      },
    ],
  }),
  component: EventsPage,
});

function EventsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["listings", "event"],
    queryFn: () => fetchListings("event"),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-bold">Live events in the UAE</h1>
      <p className="mt-2 text-muted-foreground">
        Concerts, comedy, festivals and cultural nights near you.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">
        {(data ?? []).map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
      {!isLoading && (data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No events listed yet.</p>
      ) : null}
    </main>
  );
}
