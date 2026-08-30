/**
 * A structural SEO snapshot of the pages a crawler actually ranks.
 *
 * Not a score. It reports the things this codebase can get wrong without
 * anyone noticing — a heading level lost in a refactor, a title that drifted
 * away from what the page now shows, a canonical pointing at the wrong URL,
 * JSON-LD that stopped parsing, a page that got heavier — and leaves the
 * judgement to a person.
 *
 * Fetches the live site, so it measures what Google sees rather than what the
 * source implies.
 *
 * Run with:  npx tsx scripts/check-seo.mts
 */
const SITE = process.env.SITE ?? "https://www.showsouk.com";

const PAGES = [
  "/",
  "/cinemas",
  "/cinemas/vox",
  "/cinemas/reel",
  "/cinemas/vox/mall-of-the-emirates",
  "/cinemas/vox/city-center-fujairah",
  "/movies-in/dubai",
  "/movies-in/abu-dhabi",
  "/movie/mutiny",
  "/privacy",
  "/terms",
];

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const one = (h: string, re: RegExp) => (h.match(re) ?? [])[1]?.trim();

/**
 * Entities have to be decoded before anything is measured against a character
 * budget. Counting the raw source instead reports "&amp;" as five characters
 * where a SERP shows one, which invents length problems that are not there —
 * it flagged two perfectly fine titles the first time this ran.
 */
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

type Report = {
  path: string;
  status: number;
  bytesGz: number;
  title?: string;
  titleLen: number;
  description?: string;
  descLen: number;
  canonical?: string;
  h1: string[];
  h2Count: number;
  jsonLdTypes: string[];
  jsonLdBad: number;
  words: number;
  noindex: boolean;
};

async function audit(path: string): Promise<Report> {
  const res = await fetch(`${SITE}${path}`, { headers: { "Accept-Encoding": "gzip" } });
  const html = (await res.text()).replace(/\0/g, "");
  const bytesGz = Number(res.headers.get("content-length") ?? 0);

  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => strip(m[1] ?? ""));
  const h2Count = [...html.matchAll(/<h2[^>]*>/g)].length;

  const jsonLdTypes: string[] = [];
  let jsonLdBad = 0;
  for (const m of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed = JSON.parse(m[1] ?? "");
      const nodes = parsed["@graph"] ?? (Array.isArray(parsed) ? parsed : [parsed]);
      for (const n of nodes) if (n?.["@type"]) jsonLdTypes.push(String(n["@type"]));
    } catch {
      jsonLdBad += 1;
    }
  }

  // Rendered words only: drop script/style so the loader's JSON payload does
  // not masquerade as page copy. That distinction is the whole point here —
  // serialised data is not content a crawler counts.
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ");
  const words = strip(body).split(/\s+/).filter(Boolean).length;

  const title = one(html, /<title>([\s\S]*?)<\/title>/);
  const description = one(html, /<meta name="description" content="([^"]*)"/);
  const titleLen = title ? decode(title).length : 0;
  const descLen = description ? decode(description).length : 0;

  return {
    path,
    status: res.status,
    bytesGz,
    ...(title ? { title } : {}),
    titleLen,
    ...(description ? { description } : {}),
    descLen,
    ...(one(html, /<link rel="canonical" href="([^"]*)"/)
      ? { canonical: one(html, /<link rel="canonical" href="([^"]*)"/) }
      : {}),
    h1,
    h2Count,
    jsonLdTypes,
    jsonLdBad,
    words,
    noindex: /<meta name="robots"[^>]*noindex/i.test(html),
  };
}

const reports: Report[] = [];
for (const p of PAGES) reports.push(await audit(p));

console.log("PAGE                                  STAT  H1  H2   WORDS   KBgz  TITLE  DESC");
for (const r of reports) {
  console.log(
    `${r.path.padEnd(36)} ${String(r.status).padStart(4)} ` +
      `${String(r.h1.length).padStart(3)} ${String(r.h2Count).padStart(3)} ` +
      `${String(r.words).padStart(7)} ${(r.bytesGz / 1024).toFixed(1).padStart(6)} ` +
      `${String(r.titleLen).padStart(6)} ${String(r.descLen).padStart(5)}`,
  );
}

console.log("\n--- problems ---");
const problems: string[] = [];
for (const r of reports) {
  if (r.status !== 200) problems.push(`${r.path}: HTTP ${r.status}`);
  if (r.noindex) problems.push(`${r.path}: noindex`);
  if (r.h1.length !== 1) problems.push(`${r.path}: ${r.h1.length} h1 (want exactly 1)`);
  // Compared on path, not on the whole URL. A canonical always names the
  // production origin, which is correct even when this script is pointed at a
  // dev server — checking the origin too made every page report a canonical
  // problem the moment SITE was overridden, which is how a checker teaches you
  // to ignore it.
  if (!r.canonical) problems.push(`${r.path}: no canonical`);
  else {
    let canonicalPath: string | null = null;
    try {
      canonicalPath = new URL(r.canonical).pathname;
    } catch {
      problems.push(`${r.path}: canonical is not a URL -> ${r.canonical}`);
    }
    if (canonicalPath !== null && canonicalPath !== r.path)
      problems.push(`${r.path}: canonical points at ${canonicalPath}`);
  }
  if (!r.title) problems.push(`${r.path}: no title`);
  else if (r.titleLen > 60) problems.push(`${r.path}: title ${r.titleLen} chars (>60, will truncate)`);
  if (!r.description) problems.push(`${r.path}: no description`);
  else if (r.descLen > 160) problems.push(`${r.path}: description ${r.descLen} chars (>160)`);
  if (r.jsonLdBad > 0) problems.push(`${r.path}: ${r.jsonLdBad} unparseable JSON-LD block(s)`);
  if (r.words < 150) problems.push(`${r.path}: ${r.words} rendered words (thin)`);
}
console.log(problems.length ? problems.map((p) => `  ${p}`).join("\n") : "  none");

console.log("\n--- structured data ---");
for (const r of reports) console.log(`  ${r.path.padEnd(36)} ${r.jsonLdTypes.join(", ") || "(none)"}`);

console.log("\n--- titles ---");
for (const r of reports)
  console.log(`  ${String(r.titleLen).padStart(3)}  ${r.title ? decode(r.title) : "-"}`);
