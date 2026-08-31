/**
 * venue-showtimes.tsx — one screen's panel of time chips.
 *
 * Extracted because four pages had grown their own copy. The browse board had
 * the good one — venue name with a pin, distance, a show count, chips that
 * carry the screen type and mark themselves dashed when they cannot reach a
 * single screening — and the chain, venue and city pages I added later each
 * rendered a plainer version, so the same film looked like two different
 * products depending on how you arrived at it.
 *
 * Everything about a chip lives here now: the link target, the honesty marker,
 * the aria-label, the trim affordance. A chain that starts publishing
 * per-screening URLs improves every page at once.
 */
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

import type { VenueShowtimes } from "@/lib/cinemas";
import { bookingTarget } from "@/lib/venues";
import { formatDistance } from "@/lib/showtimes";

/**
 * How many screenings share each URL, across every venue of one film.
 *
 * A link used exactly once is specific to that screening. One shared across
 * several is a film page wearing a screening's clothes, which is how Cine Royal
 * behaves — so having a link is not the same as having a link to *your* time.
 */
export function countUrlUses(venues: VenueShowtimes[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const venue of venues) {
    for (const time of venue.times) {
      if (time.bookingUrl) uses.set(time.bookingUrl, (uses.get(time.bookingUrl) ?? 0) + 1);
    }
  }
  return uses;
}

/**
 * The film-level fallback, but only when it is not itself one of the film's
 * screening URLs. Using a session URL as the film fallback sent a 20:45
 * Standard chip to an 18:45 Platinum seat map.
 */
export function filmLevelFallback(
  bookingUrl: string | null | undefined,
  sourceUrl: string | null | undefined,
  uses: Map<string, number>,
): string | null {
  return bookingUrl && !uses.has(bookingUrl) ? bookingUrl : (sourceUrl ?? null);
}

export type VenueShowtimesBlockProps = {
  venue: VenueShowtimes & { km?: number | null };
  filmTitle: string;
  filmSlug: string;
  chain: string;
  /** Film-level fallback, already resolved by filmLevelFallback. */
  filmUrl: string | null;
  chainUrl?: string | null;
  uses: Map<string, number>;
  /**
   * "" when the position is the visitor's own, " from Dubai" when it is a city
   * centre. Never " away": formatDistance explains why the number is not a
   * travel distance.
   */
  distanceSuffix?: string;
};

export function VenueShowtimesBlock({
  venue,
  filmTitle,
  filmSlug,
  chain,
  filmUrl,
  chainUrl,
  uses,
  distanceSuffix = "",
}: VenueShowtimesBlockProps) {
  return (
    /* Each screen is its own panel rather than a hairline-divided row: with 36
       venues on one film, dividers alone gave no sense of where one cinema
       ended and the next began. */
    <div className="rounded-xl border border-border/50 bg-background/40 p-4 transition-colors hover:border-border">
      {/* Stacked, not two columns: a venue with 25 screenings used to squeeze
          the name column to zero width, showing a bare pin with no name. */}
      <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-foreground">
          <MapPin className="size-4 shrink-0 self-center text-primary" />
          {venue.venue}
        </p>
        {typeof venue.km === "number" ? (
          <span className="text-xs text-muted-foreground">
            {formatDistance(venue.km)}
            {distanceSuffix}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {venue.times.length} {venue.times.length === 1 ? "show" : "shows"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {venue.times.map((screening) => {
          const href = bookingTarget({
            screeningUrl: screening.bookingUrl,
            venueName: venue.venue,
            chain,
            filmUrl,
            chainUrl: chainUrl ?? null,
          });
          // A chip that cannot reach a single screening must not look like one
          // that can. Dashed border, muted label, and a tooltip saying why.
          const exact = !!screening.bookingUrl && uses.get(screening.bookingUrl) === 1;
          return (
            <a
              key={`${screening.time}|${screening.format ?? ""}`}
              href={href ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              title={
                exact
                  ? undefined
                  : "This cinema doesn't publish a direct link to a single screening — opens their booking site"
              }
              aria-label={`${exact ? "Book" : "Open the cinema's booking site for"} ${filmTitle} at ${
                venue.venue
              }, ${screening.time}${screening.format ? `, ${screening.format}` : ""}`}
              className={`flex min-w-[4.75rem] flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition-colors ${
                exact
                  ? "border border-chip-border bg-background/60 hover:border-primary/70 hover:bg-primary/5"
                  : "border border-dashed border-chip-border bg-transparent hover:border-foreground/40 hover:bg-muted/30"
              }`}
            >
              <span
                className={`text-sm font-semibold leading-none ${
                  exact ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {screening.time}
              </span>
              {/* Screen type matters as much as the time: a 19:00 Gold seat is a
                  different product from a 19:00 Standard one. Not uppercased —
                  formats are stored canonically and shouting them would turn
                  "Samsung ONYX" into "SAMSUNG ONYX". */}
              <span
                className={`text-[10px] font-medium leading-none tracking-wide ${
                  // No alpha on the muted branch. On a light ground an alpha
                  // caps the contrast a colour can reach: even pure black at
                  // 70% tops out near 2.8:1 on white, so no token value could
                  // have fixed it. The dashed border already says "not exact";
                  // the fade was doing that job twice.
                  exact ? "text-primary-ink" : "text-muted-foreground"
                }`}
              >
                {screening.format ?? "Standard"}
              </span>
            </a>
          );
        })}

        {venue.hiddenTimes > 0 ? (
          <Link
            to="/cinemas"
            search={{ movie: filmSlug }}
            className="flex min-w-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-gold/40 px-3 py-2 text-gold transition-colors hover:border-gold/70 hover:bg-gold/5"
            aria-label={`Show ${venue.hiddenTimes} more ${
              venue.hiddenTimes === 1 ? "time" : "times"
            } for ${filmTitle} at ${venue.venue}`}
          >
            <span className="text-sm font-semibold leading-none">+{venue.hiddenTimes}</span>
            <span className="text-[10px] font-medium leading-none tracking-wide">more</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
