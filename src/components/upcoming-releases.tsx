/**
 * upcoming-releases.tsx — films announced for UAE release but not yet showing.
 *
 * Lives under /cinemas as the "Upcoming" view rather than its own page: a
 * visitor deciding what to watch is asking one question, and splitting it
 * across two nav items made them choose a section before they had the
 * information to choose with.
 *
 * Data comes from /api/public/coming-soon, which fetches and caches the source
 * server-side. These films have a release date and nothing else — never invent
 * showtimes for them; that is the whole distinction from Now Showing.
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clapperboard } from "lucide-react";

import type { ComingSoonFilm } from "@/lib/coming-soon";
import { toDayKey } from "@/lib/days";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchComingSoon(): Promise<ComingSoonFilm[]> {
  const res = await fetch("/api/public/coming-soon");
  if (!res.ok) throw new Error("coming-soon unavailable");
  const json = (await res.json()) as { films?: ComingSoonFilm[] };
  return json.films ?? [];
}

/** "2026-08-27" → "Thu, 27 Aug". Falls back to the raw string we were given. */
function formatRelease(film: ComingSoonFilm): string {
  if (!film.releaseDayKey) return film.releaseDate ?? "Date to be announced";
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${film.releaseDayKey}T12:00:00`));
}

/** Group by release date so it reads as a schedule, not a wall of cards. */
function groupByDate(films: ComingSoonFilm[]): Array<{ label: string; films: ComingSoonFilm[] }> {
  const groups = new Map<string, ComingSoonFilm[]>();
  for (const film of films) {
    const label = formatRelease(film);
    const list = groups.get(label);
    if (list) list.push(film);
    else groups.set(label, [film]);
  }
  return [...groups.entries()].map(([label, list]) => ({ label, films: list }));
}

export function UpcomingReleases() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["coming-soon"],
    queryFn: fetchComingSoon,
    staleTime: 30 * 60 * 1000,
  });

  const films = data ?? [];
  // A release dated today or earlier is already showing, and belongs in the
  // Now Showing view rather than here.
  const today = toDayKey(new Date());
  const upcoming = films.filter((f) => !f.releaseDayKey || f.releaseDayKey > today);
  const groups = groupByDate(upcoming);

  if (isLoading)
    return (
      <div aria-label="Loading upcoming releases" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-border/45 bg-card/50">
            <Skeleton className="aspect-[2/3] w-full rounded-none" />
            <div className="space-y-2 p-3"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-2/5" /></div>
          </div>
        ))}
      </div>
    );
  if (error)
    return <p className="text-destructive">Could not load upcoming releases. Please try again.</p>;

  if (upcoming.length === 0)
    return (
      <p className="state-panel p-8 text-center text-muted-foreground">
        No upcoming releases listed right now.
      </p>
    );

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
            <CalendarDays className="size-4 text-primary" />
            {group.label}
            <span className="text-sm font-normal text-muted-foreground">
              {group.films.length} {group.films.length === 1 ? "film" : "films"}
            </span>
          </h2>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {group.films.map((film) => (
              <li
                key={film.imdbId ?? film.slug}
                className="cinematic-card group overflow-hidden rounded-xl border border-border/45 bg-card/50 hover:border-gold/40"
              >
                <div className="aspect-[2/3] w-full bg-muted">
                  {film.posterUrl ? (
                    <img
                      src={film.posterUrl}
                      alt={`${film.title} poster`}
                      loading="lazy"
                      className="cinematic-image size-full object-cover group-hover:scale-[1.045]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Clapperboard className="size-8" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold">{film.title}</p>
                  {film.languages.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {film.languages.join(", ")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
