import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatAED, formatWhen, type Listing } from "@/lib/listings";

export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link
      to="/listing/$id"
      params={{ id: listing.id }}
      className="group block overflow-hidden rounded-xl border border-border/70 bg-card shadow-poster transition-transform hover:-translate-y-1"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        {listing.poster_url ? (
          <img
            src={listing.poster_url}
            alt={`${listing.title} poster`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            No poster
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge className="bg-primary text-primary-foreground capitalize">{listing.kind}</Badge>
          {listing.featured ? (
            <Badge className="bg-gold text-gold-foreground">Featured</Badge>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="line-clamp-1 text-base font-semibold">{listing.title}</h3>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5" /> {listing.venue ?? listing.city}, {listing.city}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" /> {formatWhen(listing.starts_at)}
        </p>
        <p className="pt-1 text-sm font-semibold text-gold">{formatAED(listing.price_aed)}</p>
      </div>
    </Link>
  );
}
