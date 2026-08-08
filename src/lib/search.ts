import { supabase } from "@/integrations/supabase/client";
import { CINEMA_LABELS } from "@/lib/cinemas";
import { VENUES } from "@/lib/venues";

export type SearchCategory = "movies" | "events" | "cinemas";

export type SearchResult = {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  meta: string;
  imageUrl: string | null;
  /** Route to open when the result is clicked. */
  to: "/cinemas" | "/events" | "/listing/$id" | "/movie/$slug";
  params?: { id: string } | { slug: string };

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
      .select("id, title, cinema, genre, language, rating, poster_url, venues, city")
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

  const cinemas: SearchResult[] = VENUES.filter((venue) => {
    const haystack = `${venue.name} ${venue.city} ${venue.cinema} ${
      CINEMA_LABELS[venue.cinema] ?? ""
    }`.toLowerCase();
    return haystack.includes(term);
  })
    .slice(0, 20)
    .map((venue) => ({
      id: `${venue.cinema}-${venue.name}`,
      category: "cinemas" as const,
      title: `${CINEMA_LABELS[venue.cinema] ?? venue.cinema} — ${venue.name}`,
      subtitle: venue.city,
      meta: "Cinema",
      imageUrl: null,
      to: "/cinemas" as const,
    }));

  return {
    movies,
    events: eventResults,
    cinemas,
    total: movies.length + eventResults.length + cinemas.length,
  };
}
