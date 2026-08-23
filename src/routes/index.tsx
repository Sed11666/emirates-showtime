/**
 * Route "/" — ShowSouk home (discovery hub), modelled on BookMyShow.
 *
 * Sections, top to bottom:
 *  1. Hero slider — top 4 popular scraped films, auto-advancing.
 *  2. Now Showing — de-duplicated film grid (mergeFilmsByTitle) with format
 *     badges (2D/3D/IMAX/4DX) so a title appears once, not once per chain.
 *  3. Cinema chains + newsletter footer.
 *
 * All data is live scraped data from `cinema_films`; nothing is mocked.
 *
 * Discovery only: there are no showtimes or booking actions on this page. A
 * per-film showtime board used to sit between Now Showing and the chains; it
 * was removed deliberately. Cards route to /cinemas, which owns times and
 * booking, so keep this page to artwork and titles.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronRight, Clock, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MoviePosterCard, filmToPoster, type PosterItem } from "@/components/movie-poster-card";
import { useAuth } from "@/hooks/useAuth";
import { useAuthPrompt } from "@/components/auth-prompt";
import { supabase } from "@/integrations/supabase/client";
import { Reveal } from "@/components/reveal";
import {
  fetchCinemaFilms,
  filmFormats,
  filmSlug,
  hasUpcomingScreenings,
  mergeFilmsByTitle,
  CINEMAS,
  CINEMA_LABELS,
  type MergedFilm,
} from "@/lib/cinemas";

import { VENUES } from "@/lib/venues";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShowSouk — Movies, Showtimes & Cinemas in the UAE" },
      {
        name: "description",
        content:
          "What's on across VOX, Reel, Novo and Roxy cinemas in Dubai, Abu Dhabi and the Emirates — now showing, today's showtimes and booking links in one place.",
      },
      { property: "og:title", content: "ShowSouk — Movies, Showtimes & Cinemas in the UAE" },
      {
        property: "og:description",
        content: "Today's showtimes across UAE cinema chains, updated daily.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

/**
 * Release alerts — the one thing here that genuinely cannot work anonymously,
 * and therefore the right place to ask for an account. Signed out, pressing it
 * opens the sign-in dialog and subscribes on the way back; signed in, it
 * subscribes immediately. Never a wall in front of something they could
 * otherwise do.
 */
function NotifyMeCta() {
  const { user } = useAuth();
  const { promptSignIn } = useAuthPrompt();
  const [saving, setSaving] = useState(false);

  const { data: subscribed, refetch } = useQuery({
    queryKey: ["notify-subscribed", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("notify_subscribers")
        .select("user_id")
        .maybeSingle();
      return Boolean(data);
    },
  });

  async function subscribe() {
    setSaving(true);
    // Read the session fresh: right after sign-in the hook's user may not have
    // propagated yet, and inserting a null user_id would fail the RLS check.
    const { data } = await supabase.auth.getUser();
    const current = data.user;
    if (!current) {
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("notify_subscribers")
      .upsert({ user_id: current.id, email: current.email ?? null }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save that. Please try again.");
      return;
    }
    toast.success("You're on the list.");
    void refetch();
  }

  if (subscribed) {
    return (
      <div className="mt-7 max-w-sm">
        <p className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-foreground">
          <Bell className="size-4 shrink-0 text-gold" />
          You&rsquo;re on the list — we&rsquo;ll be in touch about new releases.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-7 max-w-sm space-y-3">
      <Button
        variant="gold"
        className="w-full"
        disabled={saving}
        onClick={() =>
          promptSignIn(
            {
              key: "notify",
              title: "Get release alerts",
              description:
                "Create an account and we'll tell you when new films land in UAE cinemas.",
            },
            subscribe,
          )
        }
      >
        {saving ? "Saving…" : "Notify Me"}
      </Button>
      <p className="text-[11px] text-muted-foreground">Free. No spam. Unsubscribe anytime.</p>
    </div>
  );
}

/** Popularity heuristic: playing at more chains, venues and times ranks higher. */
function popularityScore(film: MergedFilm) {
  const showtimes = Array.isArray(film.showtimes) ? film.showtimes.length : 0;
  return film.cinemas.length * 100 + film.venues.length * 10 + showtimes;
}

function Home() {
  const { data: films } = useQuery({ queryKey: ["cinema-films"], queryFn: fetchCinemaFilms });

  const merged = useMemo(
    () =>
      mergeFilmsByTitle(films ?? [])
        // Only titles you can still go and see. Without this the grid keeps
        // showing films whose last screening started hours ago — roughly half
        // the catalogue by late evening — and every card leads to an empty
        // showtime list.
        .filter((film) => hasUpcomingScreenings(film.showtimes))
        .sort((a, b) => popularityScore(b) - popularityScore(a)),
    [films],
  );

  /** Top 4 most popular titles — the sliding hero cards. */
  const featured = useMemo(
    () => merged.filter((f) => f.poster_url?.startsWith("http")).slice(0, 4),
    [merged],
  );
  const featuredIds = new Set(featured.map((f) => f.id));

  /** Everything else goes into the Now Showing grid below. */
  const rest = useMemo<PosterItem[]>(
    () => merged.filter((f) => !featuredIds.has(f.id)).map(filmToPoster),
    [merged],
  );

  return (
    <div className="overflow-x-hidden">
      <HeroSlider films={featured} />

      {/* ── Now showing ─────────────────────────────────────── */}
      <SectionShell
        id="now-showing"
        eyebrow="In cinemas"
        title="Now Showing"
        subtitle="What's on across UAE cinemas this week"
        action={{ label: "All showtimes" }}
      >
        {rest.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {rest.map((item) => (
              <MoviePosterCard key={item.id} item={item} fullWidth />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Showtimes are updating…</p>
        )}
      </SectionShell>


      {/* ── Cinema chains ───────────────────────────────────── */}
      <SectionShell eyebrow="UAE cinema chains" title="Book by Cinema">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CINEMAS.map((chain) => {
            const locations = VENUES.filter((v) => v.cinema === chain.key).length;
            return (
              <Link
                key={chain.key}
                to="/cinemas"
                // Carry the chain through: an empty search here was why every
                // tile landed on the unfiltered board showing all seven.
                search={{ cinema: chain.key }}
                className="group rounded-2xl border border-border/60 bg-card/50 px-5 py-7 text-center transition-all hover:-translate-y-1 hover:border-gold/50 hover:gold-glow"
              >
                <p className="font-display text-sm font-bold uppercase tracking-wide">
                  {CINEMA_LABELS[chain.key]}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{locations} locations</p>
              </Link>
            );
          })}
        </div>
      </SectionShell>

      {/* ── Never miss a showtime ───────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <Reveal>
          <div className="film-grain relative overflow-hidden rounded-3xl border border-gold/25">
            <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_10%_0%,oklch(0.42_0.095_165)_0%,oklch(0.2_0.03_170)_55%,oklch(0.16_0.015_170)_100%)]" />
            <div className="relative px-7 py-14 sm:px-14">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-gold">
                <Bell className="size-3.5" /> Stay updated
              </p>
              <h2 className="mt-4 max-w-xl font-display text-3xl font-extrabold uppercase leading-tight sm:text-4xl">
                Never miss a showtime
              </h2>
              <p className="mt-4 max-w-lg text-sm text-muted-foreground">
                Get notified when your favourite movies hit UAE cinemas. Showtimes, trailers and
                booking links — all in one place.
              </p>
              {/* The email box that used to sit here collected nothing — it
                  was thrown away on navigation to /auth. An account is the
                  subscription now, so there is one thing to press. */}
              <NotifyMeCta />
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/** Full-bleed hero: the top 4 popular movies slide through automatically. */
function HeroSlider({ films }: { films: MergedFilm[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (films.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % films.length), 6000);
    return () => window.clearInterval(id);
  }, [films.length]);

  const active = films[index % Math.max(films.length, 1)];

  return (
    <section className="film-grain relative isolate min-h-[560px] overflow-hidden sm:min-h-[78vh]">
      <div aria-hidden className="absolute inset-0 -z-10">
        {films.map((film, i) => (
          <img
            key={film.id}
            src={film.poster_url ?? ""}
            alt=""
            className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.13_0.02_170/0.55)_0%,oklch(0.15_0.02_170/0.82)_45%,oklch(0.155_0.015_170)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(85%_75%_at_20%_30%,oklch(0.13_0.015_170/0.75)_0%,transparent_75%)]" />
        {films.length === 0 ? <div className="absolute inset-0 bg-hero-gradient" /> : null}
      </div>

      <div className="relative mx-auto flex min-h-[560px] max-w-7xl flex-col justify-end px-4 pb-10 pt-24 sm:min-h-[78vh] sm:pb-14 sm:pt-28">
        {active ? (
          <>
            <div className="flex flex-wrap gap-2">
              {[active.genre, active.language].filter(Boolean).map((chip) => (
                <span
                  key={chip as string}
                  className="rounded-md border border-gold/40 bg-background/50 px-2.5 py-1 text-[11px] uppercase tracking-wider text-gold backdrop-blur"
                >
                  {chip}
                </span>
              ))}
              {filmFormats(active)
                .slice(0, 2)
                .map((format) => (
                  <span
                    key={format}
                    className="rounded-md border border-gold/40 bg-background/50 px-2.5 py-1 text-[11px] uppercase tracking-wider text-gold backdrop-blur"
                  >
                    {format}
                  </span>
                ))}
            </div>

            <h1 className="mt-4 max-w-4xl font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:mt-5 sm:text-7xl">
              {active.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {active.rating ? (
                <span className="inline-flex items-center gap-1.5 text-gold">
                  <Star className="size-4 fill-gold text-gold" /> {active.rating}
                </span>
              ) : null}
              {active.duration_mins ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" /> {Math.floor(active.duration_mins / 60)}h{" "}
                  {active.duration_mins % 60}m
                </span>
              ) : null}
              <span>Now Showing in UAE</span>
            </div>

            <Button asChild variant="gold" size="lg" className="mt-7 w-fit">
              {/* Same destination as the poster cards below: the hero is a
                  movie banner, so it must not lead somewhere different. */}
              <Link to="/cinemas" search={{ movie: filmSlug(active.title) }}>
                Get Showtimes <ChevronRight className="size-4" />
              </Link>
            </Button>
          </>
        ) : (
          <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.95] sm:text-7xl">
            ShowSouk
          </h1>
        )}

        {films.length > 1 ? (
          <div className="mt-6 flex gap-2">
            {films.map((film, i) => (
              <button
                key={film.id}
                onClick={() => setIndex(i)}
                aria-label={`Show ${film.title}`}
                className={`h-1 rounded-full transition-all ${
                  i === index ? "w-8 bg-gold" : "w-4 bg-border hover:bg-muted-foreground"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  subtitle,
  action,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: { label: string };
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-14 sm:py-20">
      <Reveal>
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold">{eyebrow}</p>
              <h2 className="mt-2 font-display text-3xl font-extrabold uppercase sm:text-4xl">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {action ? (
              <Link
                to="/cinemas"
                search={{}}
                className="group inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
              >
                {action.label}
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : null}
          </div>
          <div className="gold-rule mb-8 h-px" />
          {children}
        </div>
      </Reveal>
    </section>
  );
}
