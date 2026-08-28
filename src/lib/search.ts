/**
 * search.ts — Internal-only site search.
 *
 * IMPORTANT: ShowSouk never queries an external movie catalogue. Results come
 * exclusively from our own data: `cinema_films`, `live_events`, `listings`
 * and the static VENUES list. Results are grouped into movies / events /
 * cinemas and each carries the route to navigate to.
 *
 * Consumed by: components/search-overlay.tsx (header dropdown) and
 * routes/search.tsx (full /search?q= page).
 */
import { supabase } from "@/integrations/supabase/client";
import { CINEMAS, CINEMA_LABELS, filmSlug, hasUpcomingScreenings } from "@/lib/cinemas";
import { VENUES, venueSlug } from "@/lib/venues";

export type SearchCategory = "movies" | "events" | "cinemas";

export type SearchResult = {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  meta: string;
  imageUrl: string | null;
  /**
   * Route to open when the result is clicked.
   *
   * Cinema results used to be a bare "/cinemas" with no params, so searching a
   * chain returned twenty rows that all opened the same unfiltered board — the
   * result told you the cinema existed and then refused to take you to it.
   * They now carry the chain, and a venue result its screen too.
   */
  to:
    | "/cinemas"
    | "/cinemas/$chain"
    | "/cinemas/$chain/$venue"
    | "/events"
    | "/listing/$id"
    | "/movie/$slug";
  params?: { id: string } | { slug: string } | { chain: string } | { chain: string; venue: string };
};

export type SearchResults = {
  movies: SearchResult[];
  events: SearchResult[];
  cinemas: SearchResult[];
  total: number;
};

const EMPTY: SearchResults = { movies: [], events: [], cinemas: [], total: 0 };

function escapeTerm(term: string) {
  return term.replace(/[%,()]/g, " ").trim();
}

/**
 * Global search across ShowSouk's own listings only — cinema films, live
 * events, admin listings and our known cinema venues. No external catalogue.
 */
export async function searchShowSouk(rawQuery: string): Promise<SearchResults> {
  const term = escapeTerm(rawQuery).toLowerCase();
  if (term.length < 2) return EMPTY;
  const like = `%${term}%`;

  const [films, listings, events] = await Promise.all([
    supabase
      .from("cinema_films")
      // showtimes is fetched purely so we can drop films whose last screening
      // has already started — is_active only means the scraper still sees them.
      .select("id, title, cinema, genre, language, rating, poster_url, venues, city, showtimes")
      .eq("is_active", true)
      .or(
        `title.ilike.${like},genre.ilike.${like},language.ilike.${like},rating.ilike.${like}`,
      )
      .limit(30),
    supabase
      .from("listings")
      .select("id, kind, title, genre, language, venue, city, poster_url, description, starts_at")
      .or(
        `title.ilike.${like},genre.ilike.${like},language.ilike.${like},venue.ilike.${like},city.ilike.${like},description.ilike.${like}`,
      )
      .limit(30),
    supabase
      .from("live_events")
      .select("id, title, venue, city, category, image_url, date_text, description, source")
      .eq("is_active", true)
      .or(
        `title.ilike.${like},venue.ilike.${like},city.ilike.${like},category.ilike.${like},description.ilike.${like},date_text.ilike.${like}`,
      )
      .limit(30),
  ]);

  const movies: SearchResult[] = [];
  const seenMovie = new Set<string>();
  for (const film of films.data ?? []) {
    // "Now showing" has to be true. A film whose final screening began an hour
    // ago is not bookable, so surfacing it in search only wastes a tap.
    if (!hasUpcomingScreenings(film.showtimes)) continue;
    const key = film.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seenMovie.has(key)) continue;
    seenMovie.add(key);
    movies.push({
      id: film.id,
      category: "movies",
      title: film.title,
      subtitle: "Now showing",
      meta: [film.genre, film.language, CINEMA_LABELS[film.cinema] ?? film.cinema]
        .filter(Boolean)
        .join(" · "),
      imageUrl: film.poster_url,
      to: "/movie/$slug",
      params: { slug: filmSlug(film.title) },

    });
  }

  const eventResults: SearchResult[] = [];
  for (const event of events.data ?? []) {
    eventResults.push({
      id: event.id,
      category: "events",
      title: event.title,
      subtitle: event.date_text ?? "Live event",
      meta: [event.venue, event.city, event.category].filter(Boolean).join(" · "),
      imageUrl: event.image_url,
      to: "/events",
    });
  }

  for (const listing of listings.data ?? []) {
    const result: SearchResult = {
      id: listing.id,
      category: listing.kind === "event" ? "events" : "movies",
      title: listing.title,
      subtitle: listing.kind === "event" ? "On ShowSouk" : "Listed on ShowSouk",
      meta: [listing.genre, listing.language, listing.venue, listing.city]
        .filter(Boolean)
        .join(" · "),
      imageUrl: listing.poster_url,
      to: "/listing/$id",
      params: { id: listing.id },
    };
    if (result.category === "events") eventResults.push(result);
    else {
      const key = listing.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!seenMovie.has(key)) {
        seenMovie.add(key);
        movies.push(result);
      }
    }
  }

  /**
   * Chains first, then individual screens.
   *
   * Typing "vox" used to return twenty VOX venues and nothing that meant "VOX",
   * which is almost certainly what was being asked for. A matching chain now
   * leads with one row that opens its whole board; the screens follow for
   * anyone who wanted a particular one.
   */
  const chainMatches = CINEMAS.filter(
    (c) => c.label.toLowerCase().includes(term) || c.key.includes(term),
  );

  const chainResults: SearchResult[] = chainMatches.map((chain) => ({
    id: `chain-${chain.key}`,
    category: "cinemas" as const,
    title: chain.label,
    subtitle: "All showtimes",
    meta: `${VENUES.filter((v) => v.cinema === chain.key).length} screens`,
    imageUrl: null,
    to: "/cinemas/$chain" as const,
    params: { chain: chain.key },
  }));

  const venueResults: SearchResult[] = VENUES.filter((venue) => {
    const haystack = `${venue.name} ${venue.city} ${venue.cinema} ${
      CINEMA_LABELS[venue.cinema] ?? ""
    }`.toLowerCase();
    return haystack.includes(term);
  })
    // Fewer per chain when the chain itself matched: the row above already
    // covers all of them, so twenty near-identical rows would bury the movies.
    .slice(0, chainMatches.length > 0 ? 6 : 20)
    .map((venue) => ({
      id: `${venue.cinema}-${venue.name}`,
      category: "cinemas" as const,
      title: `${CINEMA_LABELS[venue.cinema] ?? venue.cinema} — ${venue.name}`,
      subtitle: venue.city,
      meta: "Cinema",
      imageUrl: null,
      to: "/cinemas/$chain/$venue" as const,
      params: { chain: venue.cinema, venue: venueSlug(venue.name) },
    }));

  const cinemas: SearchResult[] = [...chainResults, ...venueResults];

  return {
    movies,
    events: eventResults,
    cinemas,
    total: movies.length + eventResults.length + cinemas.length,
  };
}
