/**
 * languages.ts — the language landing tier.
 *
 * "malayalam movies in dubai" and "hindi movies uae" are real, high-intent
 * queries that no other page on this site targets: /cinemas has a language
 * dropdown, but a query parameter cannot carry its own title, description or
 * canonical, so that view was unrankable by construction — the same reasoning
 * that produced the chain and city tiers.
 *
 * Curated rather than derived from the live catalogue, because a route needs a
 * known set to 404 against, and because a language that appears for one week
 * should not mint a URL that is empty the week after. Every entry here is a
 * language the UAE market actually carries; adding one is a single line, and
 * the sitemap only lists the ones with films today (see sitemap.xml.ts).
 */
export const LANGUAGE_BY_SLUG: Record<string, string> = {
  english: "English",
  hindi: "Hindi",
  malayalam: "Malayalam",
  tamil: "Tamil",
  telugu: "Telugu",
  kannada: "Kannada",
  arabic: "Arabic",
  korean: "Korean",
  japanese: "Japanese",
};

export const LANGUAGE_SLUGS = Object.keys(LANGUAGE_BY_SLUG);

/** "Malayalam" → "malayalam". Returns null for a language we have no page for. */
export function languageSlug(name: string | null | undefined): string | null {
  if (!name) return null;
  const slug = name.trim().toLowerCase();
  return slug in LANGUAGE_BY_SLUG ? slug : null;
}
