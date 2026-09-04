/**
 * Prints the <title> every venue page will emit, with its length.
 *
 * The title ladder in cinemas_.$chain_.$venue.tsx drops clauses to fit a
 * 60-character budget, so the only way to know which venues keep the city or
 * "Today" is to run all 64. Read-only.
 *
 * Run with:  npx tsx scripts/check-venue-titles.mts
 */
import { VENUES } from "../src/lib/venues";
import { CINEMA_LABELS } from "../src/lib/cinemas";

function venuePhrase(name: string): string {
  return /cinema/i.test(name) ? name : `${name} Cinema`;
}

function venueTitle(chainLabel: string, venueName: string, city: string): string {
  const venue = venuePhrase(venueName);
  const BUDGET = 60;
  const candidates = [
    `${venue} Showtimes & Timings Today — ${chainLabel}, ${city} | ShowSouk`,
    `${venue} Showtimes & Timings Today — ${chainLabel}, ${city}`,
    `${venue} Showtimes Today — ${chainLabel}, ${city}`,
    `${venue} Showtimes Today — ${chainLabel}`,
    `${venue} Showtimes — ${chainLabel}`,
    `${venue} Showtimes`,
  ];
  return candidates.find((t) => t.length <= BUDGET) ?? candidates[candidates.length - 1]!;
}

const tally = new Map<string, number>();
for (const v of VENUES) {
  const t = venueTitle(CINEMA_LABELS[v.cinema] ?? v.cinema, v.name, v.city);
  const tier = t.includes("& Timings") ? "full" : t.includes("Today") ? (t.includes(", ") ? "no-amp" : "no-city") : "bare";
  tally.set(tier, (tally.get(tier) ?? 0) + 1);
  console.log(String(t.length).padStart(3), t);
}
console.log("\nlongest:", Math.max(...VENUES.map((v) => venueTitle(CINEMA_LABELS[v.cinema] ?? v.cinema, v.name, v.city).length)));
console.log("tiers:", [...tally].map(([k, n]) => `${k}=${n}`).join("  "));
