import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import { DaySelector } from "@/components/day-selector";
import { fetchListings } from "@/lib/listings";
import {
  EVENT_SOURCE_LABELS,
  eventRunsOn,
  fetchLiveEvents,
  formatEventDate,
  type LiveEvent,
} from "@/lib/live-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Concerts & Live Events in the UAE | ShowSouk" },
      {
        name: "description",
        content:
          "Live at Coca-Cola Arena and Etihad Arena plus concerts, comedy and festivals across Dubai, Abu Dhabi and the Northern Emirates.",
      },
      { property: "og:title", content: "Concerts & Live Events in the UAE | ShowSouk" },
      {
        property: "og:description",
        content: "Find and book live experiences happening across the Emirates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsPage,
});

function LiveEventCard({ event }: { event: LiveEvent }) {
  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={`${event.title} poster`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {event.title}
          </div>
        )}
        <Badge className="absolute left-2 top-2" variant="secondary">
          {EVENT_SOURCE_LABELS[event.source] ?? event.venue ?? "Live"}
        </Badge>
      </div>
      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 font-semibold leading-tight">{event.title}</h3>
        <p className="text-xs text-muted-foreground">{formatEventDate(event)}</p>
        <p className="text-xs text-muted-foreground">
          {[event.venue, event.city].filter(Boolean).join(" · ")}
        </p>
        {event.price_text ? (
          <p className="text-xs font-medium text-primary">{event.price_text}</p>
        ) : null}
        {event.ticket_url ? (
          <Button asChild size="sm" className="w-full">
            <a href={event.ticket_url} target="_blank" rel="noreferrer noopener">
              Get tickets
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function EventsPage() {
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("any");
  const [venue, setVenue] = useState("all");

  const listingsQuery = useQuery({
    queryKey: ["listings", "event"],
    queryFn: () => fetchListings("event"),
  });
  const liveQuery = useQuery({ queryKey: ["live-events"], queryFn: fetchLiveEvents });

  const search = query.trim().toLowerCase();

  const liveEvents = useMemo(() => {
    return (liveQuery.data ?? []).filter((event) => {
      if (venue !== "all" && event.source !== venue) return false;
      if (!eventRunsOn(event, day)) return false;
      if (!search) return true;
      return `${event.title} ${event.venue ?? ""} ${event.category ?? ""}`
        .toLowerCase()
        .includes(search);
    });
  }, [liveQuery.data, venue, day, search]);

  const listings = useMemo(() => {
    return (listingsQuery.data ?? []).filter((listing) => {
      if (venue !== "all") return false;
      if (day !== "any" && listing.starts_at) {
        if (listing.starts_at.slice(0, 10) !== day) return false;
      }
      if (!search) return true;
      return `${listing.title} ${listing.venue ?? ""} ${listing.city}`
        .toLowerCase()
        .includes(search);
    });
  }, [listingsQuery.data, venue, day, search]);

  const isLoading = listingsQuery.isLoading || liveQuery.isLoading;
  const total = liveEvents.length + listings.length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-bold">Live events in the UAE</h1>
      <p className="mt-2 text-muted-foreground">
        Live listings pulled straight from Coca-Cola Arena and Etihad Arena, merged with events
        published on ShowSouk.
      </p>

      <div className="mt-6 space-y-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search artists, shows, venues…"
          className="max-w-md"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All venues" },
            { key: "coca-cola-arena", label: "Coca-Cola Arena" },
            { key: "etihad-arena", label: "Etihad Arena" },
          ].map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={venue === option.key ? "default" : "outline"}
              onClick={() => setVenue(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <DaySelector value={day} onChange={setDay} />
      </div>

      {liveEvents.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">On sale at the arenas</h2>
          <div className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-4">
            {liveEvents.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ) : null}

      {listings.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">More on ShowSouk</h2>
          <div className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      ) : null}

      {isLoading ? <p className="mt-8 text-muted-foreground">Loading events…</p> : null}
      {!isLoading && total === 0 ? (
        <p className="mt-8 text-muted-foreground">No events match these filters yet.</p>
      ) : null}
    </main>
  );
}
