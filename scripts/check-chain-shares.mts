/**
 * Measures how many upcoming screenings each chain contributes to a film on
 * cinemauae.com, so the missing_chain gate in coverage-check.ts can be set from
 * the real distribution instead of a guess.
 *
 * The question it answers: when a chain shows up for a film, is it usually a
 * substantial block of that film's day, or a stray screening or two? A gate set
 * above the stray tail suppresses the late-night false positives -- Reel's feed
 * drops sessions once they start, cinemauae does not -- without hiding a chain
 * that genuinely stopped being scraped.
 *
 * Read-only. Uses the same parser the check itself uses.
 *
 * Run with:  npx tsx scripts/check-chain-shares.mts
 */
import {
  fetchText,
  movieUrls,
  parseMoviePage,
} from "../src/routes/api/public/hooks/scrape-aggregator";
import { SHOWTIME_GRACE_MINUTES, timeToMinutes } from "../src/lib/days";

const SAMPLE = Number(process.env.SAMPLE ?? 24);
const DELAY_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dubaiNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

const nowMins = dubaiNowMinutes();
const stillUpcoming = (time: string | undefined) => {
  if (!time) return false;
  const mins = timeToMinutes(time);
  if (Number.isNaN(mins)) return false;
  // No small-hours exception — see the note in coverage-check.ts. A 01:10 show
  // is the first of its own calendar day, so by evening it has long finished.
  return mins >= nowMins - SHOWTIME_GRACE_MINUTES;
};

const urls = await movieUrls();
console.log(`${urls.length} sitemap urls; sampling ${SAMPLE}`);
console.log(`Dubai now ${String(Math.floor(nowMins / 60)).padStart(2, "0")}:${String(nowMins % 60).padStart(2, "0")}\n`);

/** One row per (film, chain) pair that has at least one upcoming screening. */
const shares: Array<{ title: string; chain: string; count: number; share: number }> = [];
let films = 0;

for (const page of urls.slice(0, SAMPLE)) {
  let html: string;
  try {
    html = await fetchText(page);
  } catch {
    continue;
  }
  await sleep(DELAY_MS);
  const parsed = parseMoviePage(html);
  if (!parsed.title || parsed.screenings.length === 0) continue;
  const upcoming = parsed.screenings.filter((s) => stillUpcoming(s.time));
  if (upcoming.length === 0) continue;
  films += 1;

  const byChain = new Map<string, number>();
  for (const s of upcoming) byChain.set(s.chainKey, (byChain.get(s.chainKey) ?? 0) + 1);
  for (const [chain, count] of byChain) {
    shares.push({ title: parsed.title, chain, count, share: count / upcoming.length });
  }
}

console.log(`${films} films with upcoming screenings, ${shares.length} (film, chain) pairs\n`);

const counts = shares.map((s) => s.count).sort((a, b) => a - b);
const sharePct = shares.map((s) => s.share).sort((a, b) => a - b);
const pct = (arr: number[], p: number) => arr[Math.floor((arr.length - 1) * p)];

console.log("screenings a chain contributes to one film:");
for (const p of [0.05, 0.1, 0.25, 0.5, 0.75, 0.95]) {
  console.log(`  p${String(p * 100).padStart(2)}  ${pct(counts, p)} screenings   ${(pct(sharePct, p) * 100).toFixed(0)}% of the film's day`);
}

for (const [n, label] of [
  [1, "exactly 1 screening"],
  [2, "2 or fewer"],
  [3, "3 or fewer"],
] as const) {
  const hit = counts.filter((c) => c <= n).length;
  console.log(`\n${label}: ${hit}/${counts.length} pairs (${((hit / counts.length) * 100).toFixed(0)}%)`);
}

// The gate exactly as coverage-check.ts applies it. Every pair measured here
// is a chain that IS present at the source; the question the gate answers is
// which of them, were they to go missing on our side, are loud enough to be
// worth waking someone for.
const CHAIN_ALERT_MIN_SCREENINGS = 2;
const CHAIN_ALERT_MIN_SHARE = 0;
const passes = (x: { count: number; share: number }) =>
  x.count >= CHAIN_ALERT_MIN_SCREENINGS && x.share >= CHAIN_ALERT_MIN_SHARE;
const material = shares.filter(passes);
const suppressed = shares.length - material.length;
console.log(
  `\ngate (>=${CHAIN_ALERT_MIN_SCREENINGS} screenings AND >=${CHAIN_ALERT_MIN_SHARE * 100}% of the film's day):`,
);
console.log(
  `  alertable: ${material.length}/${shares.length} pairs (${((material.length / shares.length) * 100).toFixed(0)}%)`,
);
console.log(
  `  suppressed: ${suppressed}/${shares.length} pairs (${((suppressed / shares.length) * 100).toFixed(0)}%)`,
);

const byChain = new Map<string, { total: number; material: number }>();
for (const x of shares) {
  const b = byChain.get(x.chain) ?? { total: 0, material: 0 };
  b.total += 1;
  if (passes(x)) b.material += 1;
  byChain.set(x.chain, b);
}
console.log("\n  per chain, film appearances that stay alertable:");
for (const [chain, stat] of [...byChain].sort((x, y) => y[1].total - x[1].total))
  console.log(`    ${chain.padEnd(11)} ${stat.material}/${stat.total}`);

// A sweep, so the chosen pair of thresholds is a decision rather than a guess.
// The tension: suppressing too little leaves the nightly Reel false positives,
// suppressing too much means a chain could quietly stop being scraped.
console.log("\nthreshold sweep (min screenings x min share -> % of pairs suppressed):");
console.log("        " + [0, 0.05, 0.1, 0.15].map((sh) => `${(sh * 100).toFixed(0).padStart(4)}%`).join(""));
for (const minN of [1, 2, 3, 4, 5]) {
  const row = [0, 0.05, 0.1, 0.15].map((minShare) => {
    const kept = shares.filter((x) => x.count >= minN && x.share >= minShare).length;
    return `${(((shares.length - kept) / shares.length) * 100).toFixed(0).padStart(4)}%`;
  });
  console.log(`  n>=${minN}  ` + row.join(""));
}

console.log("\nthinnest pairs (the ones a gate would suppress):");
for (const s of [...shares].sort((a, b) => a.count - b.count).slice(0, 12)) {
  console.log(`  ${String(s.count).padStart(2)} screenings  ${(s.share * 100).toFixed(0).padStart(3)}%  ${s.chain.padEnd(11)} ${s.title}`);
}
