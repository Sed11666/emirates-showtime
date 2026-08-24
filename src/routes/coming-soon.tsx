/**
 * Route "/coming-soon" — films announced for UAE release but not yet showing.
 *
 * Exists because the catalogue is deliberately today-only: a film with no
 * screening today is absent everywhere else on the site, so "what's out next
 * week" had no answer. This fills that gap without pretending to have showtimes
 * we do not have — every card here states a release date and nothing more.
 *
 * Data comes from /api/public/coming-soon, which fetches and caches server-side.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clapperboard } from "lucide-react";

import type { ComingSoonFilm } from "@/lib/coming-soon";
import { toDayKey } from "@/lib/days";

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

/** Group by release date so the page reads as a schedule, not a wall of cards. */
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

export const Route = createFileRoute("/coming-soon")({
  head: () => ({
    meta: [
      { title: "Coming Soon to UAE Cinemas | ShowSouk" },
      {
        name: "description",
        content:
          "Films announced for release in UAE cinemas — release dates and languages for what's arriving at VOX, Star, Novo, Reel, Roxy, Cinema City and Cine Royal.",
      },
      { property: "og:title", content: "Coming Soon to UAE Cinemas" },
      {
        property: "og:description",
        content: "What's arriving in Dubai, Abu Dhabi and across the Emirates, with release dates.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/coming-soon" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/coming-soon" }],
  }),
  component: ComingSoonPage,
});

function ComingSoonPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["coming-soon"],
    queryFn: fetchComingSoon,
    staleTime: 30 * 60 * 1000,
  });

  const films = data ?? [];
  // A release dated today or earlier is already showing, and belongs on
  // /cinemas rather than here.
  const today = toDayKey(new Date());
  const upcoming = films.filter((f) => !f.releaseDayKey || f.releaseDayKey > today);
  const groups = groupByDate(upcoming);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Coming soon</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            Next in UAE cinemas
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Films announced for release, soonest first. Showtimes appear on{" "}
            <Link to="/cinemas" className="text-gold underline-offset-4 hover:underline">
              Cinemas
            </Link>{" "}
            on the day they open.
          </p>
        </header>

        {isLoading && <p className="text-muted-foreground">Loading upcoming releases…</p>}
        {error && (
          <p className="text-destructive">Could not load upcoming releases. Please try again.</p>
        )}

        {!isLoading && !error && upcoming.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No upcoming releases listed right now.
          </p>
        )}

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
                    className="overflow-hidden rounded-xl border border-border/60 bg-card/50"
                  >
                    <div className="aspect-[2/3] w-full bg-muted">
                      {film.posterUrl ? (
                        <img
                          src={film.posterUrl}
                          alt={`${film.title} poster`}
                          loading="lazy"
                          className="size-full object-cover"
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
      </main>
    </div>
  );
}
