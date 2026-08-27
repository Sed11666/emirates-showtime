/**
 * structured-data.ts — schema.org JSON-LD.
 *
 * Only ever describes what the page actually renders. Google treats markup for
 * absent content as spam, and the honest version is also the maintainable one:
 * these builders take the same film rows the component renders from.
 *
 * What each type is here for:
 *   Movie           the film itself — eligible for Google's movie panels
 *   ScreeningEvent  one showing, with its venue and its booking link
 *   BreadcrumbList  produces a visible breadcrumb trail in search results
 *   Organization    who we are, for the knowledge panel and brand queries
 *   WebSite         enables the sitelinks search box
 *
 * Dubai is UTC+4 all year with no DST, so the offset is a constant rather than
 * something to compute.
 */
import type { CinemaFilm } from "@/lib/cinemas";

const ORIGIN = "https://www.showsouk.com";
const DUBAI_OFFSET = "+04:00";

/** ISO 8601 duration: 95 → "PT95M". Schema wants the duration form, not a number. */
function isoDuration(minutes: number | null | undefined): string | undefined {
  return typeof minutes === "number" && minutes > 0 ? `PT${Math.round(minutes)}M` : undefined;
}

/** "2026-08-26" + "16:20" → "2026-08-26T16:20:00+04:00". */
function isoInstant(date: string | null, time: string): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return undefined;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return undefined;
  return `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${DUBAI_OFFSET}`;
}

/** Drops undefined values so the emitted JSON has no empty keys. */
function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;
}

export function movieSchema(film: CinemaFilm, slug: string): Record<string, unknown> {
  return compact({
    "@type": "Movie",
    "@id": `${ORIGIN}/movie/${slug}#movie`,
    name: film.title,
    url: `${ORIGIN}/movie/${slug}`,
    image: film.poster_url ?? undefined,
    description: film.synopsis ?? undefined,
    genre: film.genre ?? undefined,
    inLanguage: film.language ?? undefined,
    contentRating: film.rating ?? undefined,
    duration: isoDuration(film.duration_mins),
    // director and actor are held back with the visible credits on /movie/$slug.
    // Google asks that structured data describe what the page actually shows, so
    // marking up names we render nowhere would be the kind of mismatch that gets
    // a rich result suppressed. Restore both alongside the visible block.
  });
}

/**
 * One ScreeningEvent per showing, capped.
 *
 * `limit` exists because a popular film runs 300+ times across three days and
 * the markup is serialised into the HTML: past some point the bytes cost more
 * than the extra events are worth. Screenings are taken in the order the page
 * lists them, so what is marked up is a prefix of what is visible, never a
 * different set.
 */
export function screeningSchemas(
  films: CinemaFilm[],
  slug: string,
  dayKey: string,
  limit = 80,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  for (const film of films) {
    const times = Array.isArray(film.showtimes) ? film.showtimes : [];
    for (const raw of times) {
      if (out.length >= limit) return out;
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const date = typeof entry["date"] === "string" ? entry["date"] : null;
      if (date !== dayKey) continue;
      const time = typeof entry["time"] === "string" ? entry["time"] : "";
      const startDate = isoInstant(date, time);
      if (!startDate) continue;

      const venue = typeof entry["venue"] === "string" ? entry["venue"] : null;
      const bookingUrl = typeof entry["booking_url"] === "string" ? entry["booking_url"] : null;

      out.push(
        compact({
          "@type": "ScreeningEvent",
          name: venue ? `${film.title} at ${venue}` : film.title,
          startDate,
          // We hand off to the chain; we never hold the seat, so the event is
          // offline and its offer points at whoever actually sells it.
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          workPresented: { "@id": `${ORIGIN}/movie/${slug}#movie` },
          location: venue
            ? compact({
                "@type": "MovieTheater",
                name: venue,
                address: compact({
                  "@type": "PostalAddress",
                  addressLocality: film.city ?? undefined,
                  addressCountry: "AE",
                }),
              })
            : undefined,
          offers: bookingUrl
            ? {
                "@type": "Offer",
                url: bookingUrl,
                availability: "https://schema.org/InStock",
                category: "primary",
              }
            : undefined,
        }),
      );
    }
  }

  return out;
}

export function breadcrumbSchema(filmTitle: string, slug: string): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Cinemas", item: `${ORIGIN}/cinemas` },
      { "@type": "ListItem", position: 3, name: filmTitle, item: `${ORIGIN}/movie/${slug}` },
    ],
  };
}

export function siteSchemas(): Array<Record<string, unknown>> {
  return [
    {
      "@type": "Organization",
      "@id": `${ORIGIN}/#organization`,
      name: "ShowSouk",
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/og-image.png`,
      areaServed: { "@type": "Country", name: "United Arab Emirates" },
      description:
        "Cinema showtimes across every major UAE chain, with a direct link to the exact screening on the cinema's own booking page.",
    },
    {
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: "ShowSouk",
      publisher: { "@id": `${ORIGIN}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${ORIGIN}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

/**
 * Wraps nodes in a single @graph document.
 *
 * One script with a graph rather than several loose scripts: it lets the nodes
 * reference each other by @id — every ScreeningEvent points at the one Movie
 * instead of restating it — which is both smaller and unambiguous.
 *
 * `<` is escaped because the JSON is injected into an HTML script element, and
 * a "</script>" inside a string would otherwise close the tag early.
 */
export function jsonLdDocument(nodes: Array<Record<string, unknown>>): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
}
