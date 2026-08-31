/**
 * Does "cinemas near you" actually put the right cinema first?
 *
 * check-service-area.mts already proves a point is judged inside or outside the
 * UAE correctly. This asks the next question, which is the one a visitor
 * notices: given a real location, is the ordering sane?
 *
 * The failure that matters is an emirate mismatch far from any border — a Dubai
 * screen offered first to someone in Al Ain, 120km away. Near a border, a
 * neighbouring emirate's cinema genuinely can be closest (Al Nahda Sharjah is
 * minutes from Deira), so that is reported rather than failed.
 *
 * Read-only, no network, no database — pure geometry over lib/venues.
 *
 * Run with:  npx tsx scripts/check-distance-sort.mts
 */
import {
  CITY_CENTERS,
  VENUES,
  distanceKm,
  filmDistanceKm,
  nearestVenues,
  withinServiceArea,
  type Coords,
} from "../src/lib/venues";

type Spot = { name: string; emirate: string; coords: Coords; note?: string };

/** Real places people actually live or start from, not just city centroids. */
const SPOTS: Spot[] = [
  { name: "Downtown Dubai", emirate: "Dubai", coords: { lat: 25.1972, lng: 55.2744 } },
  { name: "Dubai Marina", emirate: "Dubai", coords: { lat: 25.0805, lng: 55.1403 } },
  { name: "Deira", emirate: "Dubai", coords: { lat: 25.2697, lng: 55.3095 } },
  { name: "Al Majaz, Sharjah", emirate: "Sharjah", coords: { lat: 25.3241, lng: 55.3808 } },
  {
    name: "Al Nahda, Sharjah",
    emirate: "Sharjah",
    coords: { lat: 25.2952, lng: 55.373 },
    note: "sits on the Dubai border — a Dubai screen being nearest is correct",
  },
  {
    name: "University City, Sharjah",
    emirate: "Sharjah",
    coords: { lat: 25.2897, lng: 55.4903 },
  },
  { name: "Al Jimi, Al Ain", emirate: "Al Ain", coords: { lat: 24.2372, lng: 55.7256 } },
  { name: "Al Ain town centre", emirate: "Al Ain", coords: { lat: 24.2075, lng: 55.7447 } },
  { name: "Hili, Al Ain", emirate: "Al Ain", coords: { lat: 24.262, lng: 55.769 } },
  { name: "Khalifa City, Abu Dhabi", emirate: "Abu Dhabi", coords: { lat: 24.4197, lng: 54.5786 } },
  { name: "Ajman centre", emirate: "Ajman", coords: { lat: 25.4052, lng: 55.5136 } },
  { name: "Ras Al Khaimah", emirate: "Ras Al Khaimah", coords: { lat: 25.7895, lng: 55.9432 } },
  { name: "Fujairah", emirate: "Fujairah", coords: { lat: 25.1288, lng: 56.3265 } },
  { name: "Umm Al Quwain", emirate: "Umm Al Quwain", coords: { lat: 25.5647, lng: 55.5532 } },
];

/** How far a neighbouring emirate's screen may lead by before it is suspicious. */
const BORDER_TOLERANCE_KM = 25;

console.log(`${VENUES.length} venues with coordinates\n`);

const suspicious: string[] = [];
const outside: string[] = [];

for (const spot of SPOTS) {
  if (!withinServiceArea(spot.coords)) outside.push(spot.name);

  const near = nearestVenues(spot.coords, 5);
  const first = near[0];
  console.log(`${spot.name}  (${spot.emirate})`);
  for (const v of near) {
    const flag = v.city === spot.emirate ? " " : "*";
    console.log(
      `  ${flag} ${v.distanceKm.toFixed(1).padStart(6)} km  ${v.name.padEnd(34)} ${v.cinema.padEnd(11)} ${v.city}`,
    );
  }

  if (first && first.city !== spot.emirate) {
    // Is there a same-emirate screen, and how far behind is it?
    const own = VENUES.filter((v) => v.city === spot.emirate).map((v) => ({
      v,
      d: distanceKm(spot.coords, v),
    }));
    const bestOwn = own.sort((a, b) => a.d - b.d)[0];
    if (!bestOwn) {
      console.log(`    -> no screens listed in ${spot.emirate} at all`);
    } else {
      const lead = bestOwn.d - first.distanceKm;
      const verdict = lead <= BORDER_TOLERANCE_KM ? "plausible border case" : "SUSPICIOUS";
      console.log(
        `    -> nearest ${spot.emirate} screen is ${bestOwn.v.name} at ${bestOwn.d.toFixed(1)} km ` +
          `(${lead.toFixed(1)} km behind) — ${verdict}`,
      );
      if (lead > BORDER_TOLERANCE_KM)
        suspicious.push(
          `${spot.name}: ${first.name} (${first.city}, ${first.distanceKm.toFixed(1)}km) beats ` +
            `${bestOwn.v.name} (${bestOwn.d.toFixed(1)}km) by ${lead.toFixed(1)}km`,
        );
    }
  }
  if (spot.note) console.log(`    note: ${spot.note}`);
  console.log();
}

// The per-film badge uses a different path — the chain's screens filtered by the
// film's own venue names — so it is checked separately rather than assumed.
console.log("--- per-film distance badge (filmDistanceKm) ---");
const sample: Array<[string, string[]]> = [
  ["vox", ["Al Jimi Mall Cinema"]],
  ["vox", ["Mall of The Emirates Cinema"]],
  ["star", ["Al Ghurair Centre Cinema"]],
  ["novo", []],
];
for (const spotName of ["Al Jimi, Al Ain", "Al Majaz, Sharjah", "Downtown Dubai"]) {
  const spot = SPOTS.find((s) => s.name === spotName)!;
  const parts = sample.map(([chain, venues]) => {
    const d = filmDistanceKm(chain, venues, spot.coords);
    return `${chain}${venues.length ? `/${venues[0]!.replace(/ Cinema$/, "")}` : ""}=${d === null ? "null" : d.toFixed(1)}`;
  });
  console.log(`  ${spotName.padEnd(22)} ${parts.join("  ")}`);
}

console.log("\n--- city-centre fallback (used when location is denied) ---");
for (const [city, coords] of Object.entries(CITY_CENTERS)) {
  const first = nearestVenues(coords, 1)[0];
  const ok = first && first.city === city;
  console.log(
    `  ${ok ? " " : "*"} ${city.padEnd(16)} -> ${first?.name ?? "none"} (${first?.city}, ${first?.distanceKm.toFixed(1)} km)`,
  );
  if (!ok && first) suspicious.push(`city-centre ${city} -> ${first.name} in ${first.city}`);
}

console.log("\n--- verdict ---");
console.log(`  points outside the service area: ${outside.length ? outside.join(", ") : "none"}`);
console.log(`  suspicious orderings: ${suspicious.length}`);
for (const s of suspicious) console.log(`    ${s}`);
if (suspicious.length > 0 || outside.length > 0) process.exitCode = 1;
