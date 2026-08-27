/**
 * Checks what the Reel feed would write, against what we currently store.
 *
 *   npx tsx scripts/check-reel-feed.mts
 *
 * Prints per-day showtime counts both sides, so a regression shows up as the
 * source having fewer than we hold. Run after changing lib/reel-films.
 */
import { readFileSync } from "node:fs";

import { fetchReelFeed, matchReelFilm, reelMovieUrl } from "../src/lib/reel-films";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const pick = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(env)?.[1] ?? "";

const dubaiDay = (plus: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + plus * 86_400_000));

const days = [0, 1, 2].map(dubaiDay);
console.log(`window: ${days.join(", ")}\n`);

const feed = await fetchReelFeed(days);
if (feed.films.length === 0) {
  console.log("FAIL: empty feed — the GCS files moved or changed shape");
  process.exit(1);
}

const res = await fetch(
  `${pick("VITE_SUPABASE_URL")}/rest/v1/cinema_films?select=title,showtimes&is_active=eq.true&cinema=eq.reel`,
  {
    headers: {
      apikey: pick("VITE_SUPABASE_PUBLISHABLE_KEY"),
      Authorization: `Bearer ${pick("VITE_SUPABASE_PUBLISHABLE_KEY")}`,
    },
  },
);
const ours = (await res.json()) as Array<{
  title: string;
  showtimes: Array<{ date?: string }> | null;
}>;

const stored: Record<string, number> = {};
for (const r of ours) for (const s of r.showtimes ?? []) if (s.date) stored[s.date] = (stored[s.date] ?? 0) + 1;

let matched = 0;
let wouldWrite = 0;
const perDay: Record<string, number> = {};
const unmatched: string[] = [];
for (const r of ours) {
  const film = matchReelFilm(r.title, feed.films);
  if (!film) {
    unmatched.push(r.title);
    continue;
  }
  matched += 1;
  for (const s of feed.screenings.get(film.id) ?? []) {
    wouldWrite += 1;
    perDay[s.date] = (perDay[s.date] ?? 0) + 1;
  }
}

console.log("date          stored   feed");
for (const d of days) {
  console.log(`${d}   ${String(stored[d] ?? 0).padStart(5)}  ${String(perDay[d] ?? 0).padStart(5)}`);
}
console.log(`\nmatched films: ${matched}/${ours.length}`);
console.log(`showtimes: ${Object.values(stored).reduce((a, b) => a + b, 0)} stored -> ${wouldWrite} from feed`);
console.log(`venues: ${[...new Set([...feed.screenings.values()].flat().map((s) => s.venue))].join(", ")}`);
console.log(`formats: ${[...new Set([...feed.screenings.values()].flat().map((s) => s.format))].sort().join(", ")}`);
if (unmatched.length > 0) console.log(`\nkeep cinemauae showtimes: ${unmatched.join(", ")}`);
const sample = feed.films.find((f) => /mutiny/i.test(f.title));
if (sample) console.log(`\nsample link: ${reelMovieUrl(sample)}`);
