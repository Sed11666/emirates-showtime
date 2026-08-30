/**
 * Proves the gated missing_chain alert can still fire.
 *
 * A gate that suppresses noise is only half the job; the half that matters is
 * that a genuine chain outage still gets through, and a gate that quietly
 * disables an alert looks exactly like a healthy system. This rebuilds the
 * comparison coverage-check.ts makes -- their upcoming chains against our
 * all-day chains, with the 2-screening floor -- reports what fires as things
 * actually stand, then re-runs it with one chain deleted from our side.
 *
 * Measured 2026-08-30 at 13:39 Dubai over 20 films: 0 alerts live, and a
 * simulated outage fired on 15/20 films for reel, 20/20 for vox, 18/20 for
 * star. Reel matters most here -- it is the thinnest chain and the one a
 * share-based gate would have blinded.
 *
 * Read-only; it never writes to the database.
 *
 * Run with:  npx tsx scripts/check-chain-alert.mts
 */
import { readFileSync } from "node:fs";

import {
  fetchText,
  movieUrls,
  parseMoviePage,
  titleKey,
} from "../src/routes/api/public/hooks/scrape-aggregator";

const env = Object.fromEntries(
  readFileSync("C:/Users/syede/projects/emirates-showtime/.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const U = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const K = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;

const CHAIN_ALERT_MIN_SCREENINGS = 2;
const GRACE = 20;
const SAMPLE = Number(process.env.SAMPLE ?? 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const parts = Object.fromEntries(
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .map((p) => [p.type, p.value]),
);
const today = `${parts.year}-${parts.month}-${parts.day}`;
const nowMins = Number(parts.hour) * 60 + Number(parts.minute);
const stillUpcoming = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "").trim());
  if (!m) return false;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  if (mins < 6 * 60) return true;
  return mins >= nowMins - GRACE;
};

const rows = await (
  await fetch(`${U}/rest/v1/cinema_films?select=title,title_key,cinema,showtimes&is_active=eq.true`, {
    headers: { apikey: K, Authorization: `Bearer ${K}` },
  })
).json();

/** Exactly ourChainsAllDay from coverage-check.ts. */
const ourChainsAllDay = new Map();
for (const r of rows) {
  const times = Array.isArray(r.showtimes) ? r.showtimes : [];
  if (!times.some((e) => e && typeof e === "object" && e.date === today)) continue;
  const seen = ourChainsAllDay.get(r.title_key) ?? new Set();
  seen.add(r.cinema);
  ourChainsAllDay.set(r.title_key, seen);
}
console.log(`Dubai ${parts.hour}:${parts.minute}`);
console.log(`ourChainsAllDay populated for ${ourChainsAllDay.size} title keys\n`);
if (ourChainsAllDay.size === 0) throw new Error("all-day map empty -- alert would be dead");

const urls = await movieUrls();
const cases = [];
for (const page of urls.slice(0, SAMPLE)) {
  let html;
  try {
    html = await fetchText(page);
  } catch {
    continue;
  }
  await sleep(700);
  const parsed = parseMoviePage(html);
  if (!parsed.title || parsed.screenings.length === 0) continue;
  const upcoming = parsed.screenings.filter((s) => stillUpcoming(s.time));
  if (upcoming.length === 0) continue;
  const byChain = new Map();
  for (const s of upcoming) byChain.set(s.chainKey, (byChain.get(s.chainKey) ?? 0) + 1);
  cases.push({ title: parsed.title, key: titleKey(parsed.title), byChain });
}
console.log(`${cases.length} films compared\n`);

const evaluate = (drop) => {
  const fired = [];
  for (const c of cases) {
    const listed = new Set(ourChainsAllDay.get(c.key) ?? []);
    if (drop) listed.delete(drop);
    for (const [chain, n] of c.byChain) {
      if (listed.has(chain)) continue;
      if (n < CHAIN_ALERT_MIN_SCREENINGS) continue;
      fired.push(`${c.title} -> ${chain} (${n} of theirs)`);
    }
  }
  return fired;
};

const live = evaluate(null);
console.log(`as things actually stand: ${live.length} missing_chain alerts`);
for (const f of live) console.log(`  ${f}`);

for (const chain of ["reel", "vox", "star"]) {
  const sim = evaluate(chain);
  console.log(`\nif we stopped scraping "${chain}" entirely: ${sim.length} alerts`);
  for (const f of sim.slice(0, 5)) console.log(`  ${f}`);
  if (sim.length > 5) console.log(`  ... and ${sim.length - 5} more`);
}
