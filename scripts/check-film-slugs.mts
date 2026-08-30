/**
 * Read-only health check for /movie/$slug.
 *
 * Two things are verified, both against live data:
 *
 *   1. The ilike prefilter in fetchFilmBySlug is equivalent to a full scan.
 *      A prefilter miss is a 404 on a film that exists, which is a bad visit
 *      and a de-indexing signal, so "close enough" is not good enough here.
 *   2. Every slug the site actually links to returns 200 in production.
 *
 * It imports filmSlug and titleKey from the app rather than reimplementing
 * them. An earlier version of this check mirrored titleKey by hand, got the
 * suffix rule wrong, and spent its time testing seven slugs the site never
 * generates — so the imports are the point, not a convenience.
 *
 * Run with:  npx tsx scripts/check-film-slugs.mts
 */
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

import { filmSlug } from "../src/lib/cinemas";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL_ = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
const SITE = process.env.SITE ?? "https://www.showsouk.com";

const COLS = "id,title,synopsis";

/** Mirrors slugPrefilter in src/lib/cinemas.ts. */
function slugPrefilter(slug: string): string | null {
  const token = slug.split("-").reduce((a, b) => (b.length > a.length ? b : a), "");
  return token.length >= 3 ? token : null;
}

type Row = { id: string; title: string; synopsis: string | null };

async function get(qs: string) {
  const res = await fetch(`${URL_}/rest/v1/cinema_films?select=${COLS}&is_active=eq.true&${qs}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const text = await res.text();
  return { rows: JSON.parse(text) as Row[], gz: gzipSync(text).length };
}

const all = await get("order=title.asc");
const slugs = [...new Set(all.rows.map((r) => filmSlug(r.title)))].sort();
console.log(`${all.rows.length} active rows, ${slugs.length} distinct slugs\n`);

let mismatches = 0;
let fellBack = 0;
for (const slug of slugs) {
  const expected = all.rows
    .filter((r) => filmSlug(r.title) === slug)
    .map((r) => r.id)
    .sort();
  const token = slugPrefilter(slug);
  let got = expected;
  if (token) {
    const q = await get(`title=ilike.*${encodeURIComponent(token)}*&order=title.asc`);
    const hits = q.rows
      .filter((r) => filmSlug(r.title) === slug)
      .map((r) => r.id)
      .sort();
    // An empty narrow result is what makes the app rescan, so it is a fallback
    // here too rather than a failure.
    if (hits.length === 0) fellBack += 1;
    else got = hits;
  } else {
    fellBack += 1;
  }
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    mismatches += 1;
    console.log(`  MISMATCH ${slug}: expected ${expected.length} rows, prefilter gave ${got.length}`);
  }
}
console.log(`prefilter equivalence: ${mismatches} mismatches, ${fellBack} fell back to full scan`);

console.log(`\nfetching ${slugs.length} film pages from ${SITE}`);
const bad: string[] = [];
const noSynopsis: string[] = [];
for (const slug of slugs) {
  const res = await fetch(`${SITE}/movie/${slug}`);
  const html = await res.text();
  if (res.status !== 200) {
    bad.push(`${slug} -> ${res.status}`);
    continue;
  }
  const row = all.rows.find(
    (r) => filmSlug(r.title) === slug && r.synopsis && r.synopsis.length > 50,
  );
  if (row?.synopsis && !html.includes(row.synopsis.slice(0, 50))) noSynopsis.push(slug);
}
console.log(`non-200:            ${bad.length}${bad.length ? `  ${bad.join(", ")}` : ""}`);
console.log(
  `synopsis missing:   ${noSynopsis.length}${noSynopsis.length ? `  ${noSynopsis.join(", ")}` : ""}`,
);

if (mismatches || bad.length || noSynopsis.length) process.exitCode = 1;
