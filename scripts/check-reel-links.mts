/**
 * Checks Reel deep-link coverage against live data.
 *
 *   npx tsx scripts/check-reel-links.mts
 *
 * Fetches Reel's public Vista feeds and our active Reel rows, runs the real
 * matcher, and prints every match with how it was made plus the resulting URL.
 * Non-exact matches are the ones worth eyeballing: a wrong id sends someone to
 * a different film's booking page.
 */
import { readFileSync } from "node:fs";

import { fetchReelFilms, matchReelFilm, reelMovieUrl, parseTitle } from "../src/lib/reel-films";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const pick = (key: string) => new RegExp(`${key}="([^"]*)"`).exec(env)?.[1] ?? "";
const SUPABASE_URL = pick("VITE_SUPABASE_URL");
const KEY = pick("VITE_SUPABASE_PUBLISHABLE_KEY");

const films = await fetchReelFilms();
console.log(`reel films with sessions: ${films.length}`);
if (films.length === 0) {
  console.log("FAIL: no films — the GCS feed moved or changed shape");
  process.exit(1);
}

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/cinema_films?select=title,booking_url&is_active=eq.true&cinema=eq.reel`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
);
const ours = (await res.json()) as Array<{ title: string; booking_url: string | null }>;

let matched = 0;
const missed: string[] = [];
for (const row of ours) {
  const film = matchReelFilm(row.title, films);
  if (!film) {
    missed.push(row.title);
    continue;
  }
  matched += 1;
  const how = parseTitle(row.title).base === film.base ? "exact" : "loose";
  console.log(`  ${how} ${row.title.padEnd(38)} -> ${reelMovieUrl(film)}`);
}

console.log(`\nmatched ${matched}/${ours.length}`);
if (missed.length > 0) {
  console.log("no id (falls back to the chain showtimes page):");
  for (const t of missed) console.log(`  ${t}`);
}
