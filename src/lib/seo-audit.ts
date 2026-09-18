/**
 * seo-audit.ts — the single source of truth for "which URLs are landing pages".
 *
 * Both /sitemap.xml and the admin SEO health auditor read from here. When they
 * were two separate lists they drifted, and a page missing from one while
 * present in the other is exactly the bug the dashboard exists to catch.
 *
 * A target carries its sitemap metadata (changefreq/priority) as well as a
 * `tier` the dashboard groups by.
 */
import { CINEMAS, fetchCinemaFilms, filmSlug, hasUpcomingScreenings } from "@/lib/cinemas";
import { LANGUAGE_SLUGS, languageSlug } from "@/lib/languages";
import { CITY_BY_SLUG, VENUES, venueSlug } from "@/lib/venues";

export const SITE_ORIGIN = "https://www.showsouk.com";

export type SeoTier = "home" | "chain" | "venue" | "emirate" | "language" | "film" | "legal";

export type SeoTarget = {
  path: string;
  tier: SeoTier;
  changefreq: string;
  priority: string;
};

export const TIER_LABELS: Record<SeoTier, string> = {
  home: "Home & browse",
  chain: "Cinema chains",
  venue: "Screens",
  emirate: "Emirates",
  language: "Languages",
  film: "Films",
  legal: "Legal",
};

/** The static tiers — always meaningful, so they never depend on a database read. */
export function staticTargets(): SeoTarget[] {
  return [
    { path: "/", tier: "home", changefreq: "hourly", priority: "1.0" },
    { path: "/cinemas", tier: "home", changefreq: "hourly", priority: "0.9" },
    { path: "/privacy", tier: "legal", changefreq: "yearly", priority: "0.3" },
    { path: "/terms", tier: "legal", changefreq: "yearly", priority: "0.3" },
    ...CINEMAS.map((c) => ({
      path: `/cinemas/${c.key}`,
      tier: "chain" as const,
      changefreq: "hourly",
      priority: "0.9",
    })),
    ...VENUES.map((v) => ({
      path: `/cinemas/${v.cinema}/${venueSlug(v.name)}`,
      tier: "venue" as const,
      changefreq: "hourly",
      priority: "0.8",
    })),
    ...Object.keys(CITY_BY_SLUG).map((slug) => ({
      path: `/movies-in/${slug}`,
      tier: "emirate" as const,
      changefreq: "hourly",
      priority: "0.9",
    })),
  ];
}

/**
 * Language and film tiers, listed only while they actually have screenings —
 * a page whose last film just left renders an empty schedule, and submitting
 * those teaches Google to distrust the sitemap.
 */
export async function catalogueTargets(): Promise<SeoTarget[]> {
  const out: SeoTarget[] = [];
  const films = await fetchCinemaFilms();

  const withFilms = new Set<string>();
  for (const film of films) {
    if (!hasUpcomingScreenings(film.showtimes)) continue;
    const slug = languageSlug(film.language);
    if (slug) withFilms.add(slug);
  }
  for (const slug of LANGUAGE_SLUGS) {
    if (withFilms.has(slug)) {
      out.push({
        path: `/movies/${slug}`,
        tier: "language",
        changefreq: "hourly",
        priority: "0.8",
      });
    }
  }

  // One entry per title, not per row: the same film has a row per chain and
  // per city, and they all resolve to the same /movie/{slug}.
  const seen = new Set<string>();
  for (const film of films) {
    if (!hasUpcomingScreenings(film.showtimes)) continue;
    const slug = filmSlug(film.title);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ path: `/movie/${slug}`, tier: "film", changefreq: "daily", priority: "0.8" });
  }

  return out;
}

/**
 * Every indexable landing page. A catalogue read failure yields the static
 * tiers rather than an error — a partial sitemap beats a 500, and the auditor
 * records the shortfall in its notes.
 */
export async function allTargets(): Promise<{ targets: SeoTarget[]; catalogueOk: boolean }> {
  try {
    return { targets: [...staticTargets(), ...(await catalogueTargets())], catalogueOk: true };
  } catch {
    return { targets: staticTargets(), catalogueOk: false };
  }
}
