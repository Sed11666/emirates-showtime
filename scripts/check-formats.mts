/**
 * Lists the distinct screen formats present in live data, with how many active
 * films and which cities carry each.
 *
 * Feeds keyword research: a format landing page ("IMAX cinemas in Dubai") is
 * only worth researching if we actually hold the data to fill it. Read-only.
 *
 * Talks to PostgREST directly rather than importing the app's client, because
 * that client reads import.meta.env, which does not exist outside Vite.
 *
 * Run with:  npx tsx scripts/check-formats.mts
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("missing SUPABASE_URL / key in .env");

const res = await fetch(
  `${url}/rest/v1/cinema_films?select=title,city,cinema,formats&is_active=eq.true`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);

type Row = { title: string; city: string | null; cinema: string; formats: string[] | null };
const rows: Row[] = await res.json();

const byFormat = new Map<string, { rows: number; titles: Set<string>; cities: Set<string> }>();
for (const r of rows) {
  for (const raw of r.formats ?? []) {
    const k = String(raw).trim();
    if (!k) continue;
    const e = byFormat.get(k) ?? { rows: 0, titles: new Set<string>(), cities: new Set<string>() };
    e.rows += 1;
    e.titles.add(r.title);
    if (r.city) e.cities.add(r.city);
    byFormat.set(k, e);
  }
}

console.log(`${rows.length} active film rows\n`);
console.log("format".padEnd(24) + "rows".padStart(6) + "titles".padStart(8) + "  cities");
for (const [f, e] of [...byFormat].sort((a, b) => b[1].rows - a[1].rows)) {
  console.log(
    f.padEnd(24) + String(e.rows).padStart(6) + String(e.titles.size).padStart(8) +
      "  " + [...e.cities].sort().join(", "),
  );
}
