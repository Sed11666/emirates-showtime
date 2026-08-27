/**
 * Checks UAE_OUTLINE in lib/venues against known coordinates.
 *
 *   npx tsx scripts/check-service-area.mts
 *
 * Run this after adding a venue. The outline decides whether a visitor's own
 * position is used for distances, and a screen outside it would quietly report
 * everyone as being abroad — a silent failure with no error anywhere, which is
 * why the venue sweep at the bottom exists.
 *
 * The two rejected approaches are recorded in lib/venues; the numbers that
 * killed them come from this script. Sohar in Oman is 92 km from a UAE screen
 * while Liwa, inside the UAE, is 153 km, so no radius separates them.
 */
import { withinServiceArea, VENUES, distanceKm, CITY_CENTERS } from "../src/lib/venues";

const nearest = (lat: number, lng: number) =>
  Math.min(...VENUES.map((v) => distanceKm({ lat, lng }, { lat: v.lat, lng: v.lng })));

const cases: Array<[string, number, number, boolean]> = [
  // Inside the UAE, biased towards places far from a cinema.
  ["Dubai Marina", 25.0805, 55.1403, true],
  ["Abu Dhabi centre", 24.4539, 54.3773, true],
  ["Al Ain", 24.2075, 55.7447, true],
  ["Fujairah", 25.1288, 56.3265, true],
  ["Ras Al Khaimah", 25.7895, 55.9432, true],
  ["Umm Al Quwain", 25.5647, 55.5532, true],
  ["Sharjah", 25.3463, 55.4209, true],
  ["Ajman", 25.4052, 55.5136, true],
  ["Liwa Oasis", 23.1333, 53.7833, true],
  ["Madinat Zayed", 23.6522, 53.7, true],
  ["Ghayathi", 23.8386, 52.8103, true],
  ["Al Sila (far west)", 24.0244, 51.6103, true],
  ["Ruwais", 24.1103, 52.7306, true],
  ["Hatta", 24.7994, 56.1233, true],
  // Abroad.
  ["Doha, Qatar", 25.2854, 51.531, false],
  ["Al Wakrah, Qatar", 25.1659, 51.6035, false],
  ["Manama, Bahrain", 26.2285, 50.5861, false],
  ["Muscat, Oman", 23.588, 58.3829, false],
  ["Sohar, Oman", 24.3417, 56.7089, false],
  ["Khasab, Oman (Musandam)", 26.1799, 56.2477, false],
  ["Riyadh, Saudi Arabia", 24.7136, 46.6753, false],
  ["Dammam, Saudi Arabia", 26.3927, 49.9777, false],
  ["Karachi, Pakistan", 24.8607, 67.0011, false],
  ["Mumbai, India", 19.076, 72.8777, false],
  ["London, UK", 51.5074, -0.1278, false],
  ["New York, USA", 40.7128, -74.006, false],
];

let failed = 0;
for (const [name, lat, lng, expected] of cases) {
  const actual = withinServiceArea({ lat, lng });
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name.padEnd(25)} ${nearest(lat, lng).toFixed(0).padStart(5)} km to a screen -> ${actual ? "UAE" : "abroad"}`,
  );
}

for (const [name, point] of Object.entries(CITY_CENTERS)) {
  if (!withinServiceArea(point)) {
    console.log(`FAIL city centre reads as abroad: ${name}`);
    failed += 1;
  }
}
// Every screen we list must sit inside, or the outline is wrong.
for (const venue of VENUES) {
  if (!withinServiceArea({ lat: venue.lat, lng: venue.lng })) {
    console.log(`FAIL venue reads as abroad: ${venue.name} (${venue.city})`);
    failed += 1;
  }
}

console.log(`\n${failed === 0 ? "all passed" : `${failed} FAILED`}`);
