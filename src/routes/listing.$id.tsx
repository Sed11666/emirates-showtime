import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, Globe, MapPin, Tag } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchListing, formatAED, formatWhen } from "@/lib/listings";

export const Route = createFileRoute("/listing/$id")({
  head: () => ({
    meta: [
      { title: "Listing details | ShowUAE" },
      {
        name: "description",
        content: "Showtimes, venue, language and ticket pricing for this UAE listing.",
      },
      { property: "og:title", content: "Listing details | ShowUAE" },
      {
        property: "og:description",
        content: "Showtimes, venue and ticket pricing for this UAE listing.",
      },
    ],
  }),
  component: ListingDetail,
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-6xl px-4 py-20">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-20">This listing no longer exists.</div>
  ),
});

function ListingDetail() {
  const { id } = Route.useParams();
  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListing(id),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading…</div>;
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <p className="text-muted-foreground">This listing no longer exists.</p>
        <Link to="/" className="mt-4 inline-block text-gold hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <div className="grid gap-10 md:grid-cols-[320px_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-poster">
          {listing.poster_url ? (
            <img
              src={listing.poster_url}
              alt={`${listing.title} poster`}
              className="aspect-[3/4] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center text-muted-foreground">
              No poster
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-primary text-primary-foreground capitalize">{listing.kind}</Badge>
            {listing.genre ? <Badge variant="secondary">{listing.genre}</Badge> : null}
            {listing.certification ? (
              <Badge variant="outline">{listing.certification}</Badge>
            ) : null}
          </div>

          <h1 className="mt-4 text-4xl font-bold">{listing.title}</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {listing.description ?? "No description provided."}
          </p>

          <dl className="mt-8 grid max-w-lg grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Detail icon={<MapPin className="size-4" />} label="Venue">
              {listing.venue ?? "—"}, {listing.city}
            </Detail>
            <Detail icon={<CalendarDays className="size-4" />} label="When">
              {formatWhen(listing.starts_at)}
            </Detail>
            <Detail icon={<Clock className="size-4" />} label="Duration">
              {listing.duration_mins ? `${listing.duration_mins} min` : "—"}
            </Detail>
            <Detail icon={<Globe className="size-4" />} label="Language">
              {listing.language ?? "—"}
            </Detail>
          </dl>

          <div className="mt-10 flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">From</p>
              <p className="text-2xl font-bold text-gold">{formatAED(listing.price_aed)}</p>
            </div>
            <Button
              variant="hero"
              size="lg"
              className="ml-auto"
              onClick={() => toast.success("Seats held — checkout is coming soon.")}
            >
              <Tag /> Book tickets
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/60 p-3">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}
