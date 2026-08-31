/**
 * GET/POST /api/public/hooks/coverage-check — are we still keeping up with the source?
 *
 * The scraper reports what it *did*. This reports whether the result is still
 * right, by going back to cinemauae and comparing what they publish against
 * what we hold. Those are different questions: every run can report ok:true
 * while coverage quietly rots, which is exactly how a third of the catalogue
 * once ended up with no future showtimes and nothing said so.
 *
 * WHY THIS RUNS HERE AND NOT AS A SCHEDULED CLOUD AGENT.
 * It was tried. A cloud routine's sandbox blocks outbound traffic by policy:
 * on 2026-08-28 a scheduled health check returned 403 "policy denial" for both
 * wrytmjudhqiyivzadwib.supabase.co and cinemauae.com and could do nothing. This
 * route runs on Vercel, which already reaches both every fifteen minutes, so
 * the check lives beside the thing it checks.
 *
 * DELIBERATELY READ-ONLY. It writes nothing, holds no token, and touches no
 * RPC. A monitor that can modify what it monitors is a monitor you cannot
 * trust when it disagrees with you.
 *
 * COST. A full comparison would be ~162 pages, far past the caller's timeout,
 * so it samples. The sample rotates on the clock the same way the scraper
 * paces itself, so consecutive runs cover different films and a full sweep
 * happens over a day rather than in one request.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  dubaiDayPlus,
  fetchText,
  movieUrls,
  parseMoviePage,
  titleKey,
} from "@/routes/api/public/hooks/scrape-aggregator";
import { VENUES } from "@/lib/venues";
import { SHOWTIME_GRACE_MINUTES, timeToMinutes } from "@/lib/days";

/**
 * Minutes since midnight, Dubai. Used to compare only screenings a visitor
 * could still act on — see `stillUpcoming`.
 */
function dubaiNowMinutes(): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Well under the 120s pg_cron HTTP timeout, and under Vercel's function cap. */
const BUDGET_MS = 40_000;
const PAGE_DELAY_MS = 700;
const DEFAULT_SAMPLE = 12;

/**
 * Rotate the sample with the clock so a 5-hourly job walks the whole sitemap
 * over about three days rather than re-checking the same twelve films forever.
 */
const ROTATE_WINDOW_MS = 5 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Alert = { level: "alert" | "warn"; kind: string; detail: string };

type Summary = {
  severity: "ok" | "warn" | "alert";
  day: string;
  sampled: number;
  titlesPct: number;
  screeningsPct: number;
  activeTitles: number;
  screeningsToday: number;
  alerts: Alert[];
  perFilm: Array<{ title: string; theirs: number; ours: number }>;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The subject line carries the verdict.
 *
 * This arrives five times a day, so it has to be triageable from the inbox
 * list without opening it. A subject that reads the same whether coverage is
 * perfect or collapsed is how a recurring report gets filtered to a folder and
 * never read again — which is worse than not sending it.
 */
function subjectFor(s: Summary): string {
  const stat = `${s.screeningsPct}% screenings, ${s.sampled} films`;
  if (s.severity === "ok") return `[ShowSouk] Coverage OK — ${stat}`;
  const n = s.alerts.length;
  const word = n === 1 ? "issue" : "issues";
  const tag = s.severity === "alert" ? "ALERT" : "warning";
  return `[ShowSouk] Coverage ${tag}: ${n} ${word} — ${stat}`;
}

function bodyFor(s: Summary): string {
  const colour =
    s.severity === "alert" ? "#b42318" : s.severity === "warn" ? "#b54708" : "#067647";
  const alertRows =
    s.alerts.length === 0
      ? `<p style="margin:0;color:#475467">No discrepancies found.</p>`
      : s.alerts
          .map(
            (a) =>
              `<li style="margin-bottom:8px"><strong style="color:${
                a.level === "alert" ? "#b42318" : "#b54708"
              }">${a.level.toUpperCase()}</strong> · <code>${esc(a.kind)}</code><br>${esc(
                a.detail,
              )}</li>`,
          )
          .join("");
  const films = s.perFilm
    .slice(0, 8)
    .map(
      (f) =>
        `<tr><td style="padding:3px 12px 3px 0">${esc(f.title)}</td><td style="padding:3px 0;color:#475467">${f.ours} / ${f.theirs}</td></tr>`,
    )
    .join("");

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:640px;color:#101828">
  <h2 style="margin:0 0 4px">ShowSouk coverage check</h2>
  <p style="margin:0 0 16px;color:#475467">${s.day} · compared against cinemauae.com</p>
  <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:${colour}">${s.severity.toUpperCase()}</p>
  <table style="border-collapse:collapse;margin-bottom:20px">
    <tr><td style="padding:3px 16px 3px 0;color:#475467">Upcoming screenings held</td><td><strong>${s.screeningsPct}%</strong></td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#475467">Titles vs their sitemap</td><td>${s.titlesPct}%</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#475467">Films sampled</td><td>${s.sampled}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#475467">Our upcoming screenings today</td><td>${s.screeningsToday}</td></tr>
  </table>
  <h3 style="margin:0 0 8px;font-size:15px">Findings</h3>
  <ul style="margin:0 0 20px;padding-left:18px;color:#101828">${alertRows}</ul>
  <h3 style="margin:0 0 8px;font-size:15px">Sampled films (ours / theirs)</h3>
  <table style="border-collapse:collapse;font-size:14px">${films}</table>
  <p style="margin:24px 0 0;font-size:12px;color:#98a2b3">
    Sent by the coverage-check route. Titles sit near 72% normally — their sitemap
    includes coming-soon films with no screenings.
  </p>
</div>`;
}

/**
 * Send via Resend's REST API.
 *
 * Called directly with fetch rather than through their SDK so nothing is added
 * to package.json — this repo carries two lockfiles that must move together,
 * and a dependency for one HTTP POST is not worth that.
 *
 * Absent configuration this is a no-op that says so, matching how
 * resolve-posters treats a missing TMDB key: the check still runs and still
 * reports, it just does not email.
 */
async function emailReport(summary: Summary): Promise<{ sent: boolean; note: string }> {
  const key = process.env["RESEND_API_KEY"];
  const to = process.env["COVERAGE_ALERT_TO"];
  const from = process.env["COVERAGE_ALERT_FROM"] ?? "ShowSouk <onboarding@resend.dev>";
  if (!key) return { sent: false, note: "RESEND_API_KEY not set" };
  if (!to) return { sent: false, note: "COVERAGE_ALERT_TO not set" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: to.split(",").map((a) => a.trim()).filter(Boolean),
        subject: subjectFor(summary),
        html: bodyFor(summary),
      }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      return { sent: false, note: `Resend ${res.status}: ${text}` };
    }
    return { sent: true, note: "sent" };
  } catch (err) {
    // Never fail the check because the mail failed. The report is the product;
    // the email is delivery.
    return { sent: false, note: `send failed: ${(err as Error).message}` };
  }
}

/**
 * Thresholds. Set deliberately loose: a monitor that cries wolf gets muted,
 * and then it is worse than not having one.
 *
 * Titles are compared against the sitemap, which includes coming-soon films
 * with no screenings at all, so our count is legitimately lower and only a
 * large gap means anything.
 */
/**
 * Set low on purpose. A live run measured 46 active titles against 64 sitemap
 * entries — 72% — with coverage otherwise perfect, because the difference is
 * coming-soon films that legitimately have no screenings. A 70% warn threshold
 * would have fired on that and every time they add a trailer page, and an
 * alert nobody believes is worse than none. This now only catches a collapse:
 * the scraper dying and half the catalogue ageing out.
 *
 * The sharp signal for a genuinely missing film is `missing_film` below, which
 * is evidence-based — the sample proved the film has screenings.
 */
const TITLE_COVERAGE_ALERT = 0.35;
const TITLE_COVERAGE_WARN = 0.5;
/** Per sampled film: ours vs theirs for the same day. */
const FILM_SCREENING_WARN = 0.6;
const SAMPLE_SCREENING_ALERT = 0.7;

/**
 * How many screenings a chain must hold at the source before its absence here
 * is worth an alert.
 *
 * missing_chain exists to catch a chain-level failure — we stopped scraping
 * Reel — not a one-screening discrepancy, and without a floor the second
 * drowns the first. Measured against cinemauae at 13:29 Dubai over 24 films
 * and 120 (film, chain) pairs: 11% of pairs are a chain contributing exactly
 * one screening, worth 1–6% of that film's day. One screening is below the
 * noise floor for a claim about a whole chain.
 *
 * Deliberately a count and not a share. A share threshold reads better on the
 * aggregate — 10% suppresses a comparable slice of pairs — but it measures the
 * wrong thing: Reel is a small premium chain, structurally a thin slice of
 * every film it plays, so a 10% rule cut its alertable appearances from 19/23
 * to 6/23 while leaving VOX untouched at 24/24. That blinds the alert to the
 * chain most likely to fail silently, Reel being the one chain we ingest from
 * its own feed rather than from cinemauae. A flat count of two treats the
 * chains alike and suppresses only the single-screening tail (13 of 120 pairs).
 *
 * Re-measure with scripts/check-chain-shares.mts before changing this.
 */
const CHAIN_ALERT_MIN_SCREENINGS = 2;

async function run(request: Request) {
  const started = Date.now();
  const SUPABASE_URL =
    import.meta.env?.["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const SUPABASE_KEY =
    import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ ok: false, error: "Supabase config missing" }, { status: 500 });
  }

  const url = new URL(request.url);
  const sampleSize = Math.min(
    30,
    Math.max(1, Number(url.searchParams.get("sample") ?? DEFAULT_SAMPLE) || DEFAULT_SAMPLE),
  );

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Today only. The source publishes three days, but comparing one keeps the
  // run inside budget and today is the day a visitor is acting on.
  const today = dubaiDayPlus(0);

  /**
   * Both sides are compared on screenings that have not started yet.
   *
   * Without this the check reports a difference every day for Reel, because
   * the two sources age differently rather than because anything is missing:
   * Reel's own feed drops a session once it starts, while cinemauae lists the
   * whole day regardless. Measured on 2026-08-29, that alone produced two
   * missing_chain warnings for films we were covering perfectly well.
   *
   * Comparing what a visitor could still book is also the question actually
   * worth asking, and it is the same rule the UI uses to decide what to show.
   */
  /**
   * There is deliberately no small-hours exception here.
   *
   * This used to return true for anything before 06:00, on the premise that a
   * 01:10 chip was the tail of the previous evening. 20bcb8d disproved that
   * against the source itself: each ?d=N tab is one plain calendar day, and a
   * Roxy chip on the 27 Aug tab links to .../27+Aug+2026/00:00. A small-hours
   * show is the first show of its own day, not the last of the day before.
   *
   * Keeping the exception made the check disagree with the site it monitors.
   * lib/days has no such rule, so at 20:18 the board correctly treats this
   * morning's 01:10 as finished while the check counted it as still ahead —
   * and counted it on cinemauae's side only, because Reel's feed prunes a
   * session once it starts. That asymmetry was the whole of the "missing"
   * 3%: 14 of the 31 absent screenings in an 8-film sample were Reel
   * small-hours shows we hold under the correct date, and the rest were
   * cinemauae listing this morning's early shows on today's tab.
   */
  const nowMins = dubaiNowMinutes();
  const stillUpcoming = (time: string | undefined) => {
    if (!time) return false;
    const mins = timeToMinutes(time);
    if (Number.isNaN(mins)) return false;
    return mins >= nowMins - SHOWTIME_GRACE_MINUTES;
  };

  const { data: rows, error } = await db
    .from("cinema_films")
    .select("title, title_key, cinema, city, venues, showtimes")
    .eq("is_active", true);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Row = {
    title: string;
    title_key: string;
    cinema: string;
    venues: string[] | null;
    showtimes: unknown;
  };
  const ours = (rows ?? []) as Row[];

  /** Our screenings for `today`, per title_key, with the chains they sit on. */
  const oursByKey = new Map<string, { count: number; chains: Set<string> }>();
  /**
   * Chains we list for a film anywhere in today, started or not.
   *
   * Screening *counts* are rightly compared on what is still ahead — that is
   * what a visitor can act on. Chain *presence* must not be, and conflating the
   * two produced the "Off the Grid" false positive on 2026-08-29, a film where
   * we in fact held 11 of their 12 screenings.
   *
   * The mechanism is simply that the day ages. Once a chain's last screening
   * for a film has started, it vanishes from an upcoming-only view of our data
   * while cinemauae goes on listing it, so the comparison reports a missing
   * chain when nothing is missing. Counted against live data at 13:36 Dubai —
   * mid-afternoon, not even the worst of it — 19 (film, chain) pairs were
   * already in that state: star 10, vox 5, cinemacity 3, novo 1. The population
   * grows all evening, which is why the alert fired on the 00:37 Dubai run.
   *
   * Reel aggravates this, because its feed also drops a session the moment it
   * starts, but Reel is not the cause and was not among those 19. Any chain
   * reaches the same state eventually.
   *
   * Asking whether we list the chain at all today answers the question the
   * alert is actually for — did we stop scraping this chain — and is immune to
   * the time of day.
   */
  const ourChainsAllDay = new Map<string, Set<string>>();
  let ourTodayTotal = 0;
  for (const row of ours) {
    const times = Array.isArray(row.showtimes) ? row.showtimes : [];
    let n = 0;
    let anyToday = false;
    for (const entry of times) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e["date"] !== today) continue;
      anyToday = true;
      if (!stillUpcoming(typeof e["time"] === "string" ? e["time"] : undefined)) continue;
      n += 1;
    }
    if (anyToday) {
      const seen = ourChainsAllDay.get(row.title_key) ?? new Set<string>();
      seen.add(row.cinema);
      ourChainsAllDay.set(row.title_key, seen);
    }
    if (n === 0) continue;
    ourTodayTotal += n;
    const bucket = oursByKey.get(row.title_key) ?? { count: 0, chains: new Set<string>() };
    bucket.count += n;
    bucket.chains.add(row.cinema);
    oursByKey.set(row.title_key, bucket);
  }

  const ourTitles = new Set(ours.map((r) => r.title_key));

  let urls: string[];
  try {
    urls = await movieUrls();
  } catch (err) {
    return Response.json(
      { ok: false, error: `sitemap unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // Rotate the window, then wrap, so every film is eventually sampled.
  const offset =
    (Math.floor(Date.now() / ROTATE_WINDOW_MS) * sampleSize) % Math.max(1, urls.length);
  const ordered = [...urls.slice(offset), ...urls.slice(0, offset)];

  const knownVenues = new Set(VENUES.map((v) => v.name.toLowerCase()));
  const alerts: Alert[] = [];
  const perFilm: Array<{
    title: string;
    theirs: number;
    ours: number;
    missingChains: string[];
  }> = [];
  const unknownVenues = new Set<string>();

  let sampled = 0;
  let fetchFailures = 0;
  let theirTotal = 0;
  let ourSampledTotal = 0;

  for (const page of ordered) {
    if (sampled >= sampleSize || Date.now() - started > BUDGET_MS) break;

    let html: string;
    try {
      html = await fetchText(page);
    } catch {
      fetchFailures += 1;
      continue;
    }
    await sleep(PAGE_DELAY_MS);

    const parsed = parseMoviePage(html);
    if (!parsed.title || parsed.screenings.length === 0) continue; // coming-soon page
    sampled += 1;

    const key = titleKey(parsed.title);
    // Their page is d=0, so every screening on it is today's. Narrowed to the
    // ones still ahead so both sides are counted on the same basis.
    const upcoming = parsed.screenings.filter((s) => stillUpcoming(s.time));
    const theirChains = new Set(upcoming.map((s) => s.chainKey));
    const theirByChain = new Map<string, number>();
    for (const s of upcoming) theirByChain.set(s.chainKey, (theirByChain.get(s.chainKey) ?? 0) + 1);
    // Venue discovery uses every screening: a venue we do not know is worth
    // reporting whether or not its next show has started.
    for (const s of parsed.screenings) {
      if (s.venue && !knownVenues.has(s.venue.toLowerCase())) unknownVenues.add(s.venue);
    }
    if (upcoming.length === 0) continue; // nothing left today; nothing to compare

    const mine = oursByKey.get(key);
    const theirs = upcoming.length;
    const mineCount = mine?.count ?? 0;
    theirTotal += theirs;
    ourSampledTotal += mineCount;

    const listedByUs = ourChainsAllDay.get(key) ?? new Set<string>();
    const missingChains = [...theirChains].filter((c) => !listedByUs.has(c));
    // Every missing chain stays in the report body. Only the alert is gated, so
    // a thin one is still visible to anyone reading the run rather than erased.
    const materialMissing = missingChains.filter(
      (c) => (theirByChain.get(c) ?? 0) >= CHAIN_ALERT_MIN_SCREENINGS,
    );
    perFilm.push({ title: parsed.title, theirs, ours: mineCount, missingChains });

    if (!ourTitles.has(key)) {
      alerts.push({
        level: "alert",
        kind: "missing_film",
        detail: `"${parsed.title}" has ${theirs} screenings at the source and no active row here.`,
      });
    } else if (mineCount === 0) {
      alerts.push({
        level: "alert",
        kind: "missing_day",
        detail: `"${parsed.title}" has ${theirs} screenings at the source today and none stored for ${today}.`,
      });
    } else if (mineCount < theirs * FILM_SCREENING_WARN) {
      alerts.push({
        level: "warn",
        kind: "under_covered",
        detail: `"${parsed.title}": ${mineCount} screenings here vs ${theirs} at the source today.`,
      });
    }

    if (materialMissing.length > 0 && mineCount > 0) {
      const detail = materialMissing
        .map((c) => `${c} (${theirByChain.get(c)} of their ${theirs})`)
        .join(", ");
      alerts.push({
        level: "warn",
        kind: "missing_chain",
        detail: `"${parsed.title}" is listed at ${detail} by the source but not by us.`,
      });
    }
  }

  // Sitemap titles include coming-soon films with no screenings, so this ratio
  // is expected to sit below 1. Only a large gap is meaningful.
  const titleCoverage = urls.length > 0 ? ourTitles.size / urls.length : 1;
  if (titleCoverage < TITLE_COVERAGE_ALERT) {
    alerts.push({
      level: "alert",
      kind: "title_coverage",
      detail: `${ourTitles.size} active titles against ${urls.length} in their sitemap (${Math.round(titleCoverage * 100)}%).`,
    });
  } else if (titleCoverage < TITLE_COVERAGE_WARN) {
    alerts.push({
      level: "warn",
      kind: "title_coverage",
      detail: `${ourTitles.size} active titles against ${urls.length} in their sitemap (${Math.round(titleCoverage * 100)}%).`,
    });
  }

  const sampleCoverage = theirTotal > 0 ? ourSampledTotal / theirTotal : 1;
  if (sampled > 0 && sampleCoverage < SAMPLE_SCREENING_ALERT) {
    alerts.push({
      level: "alert",
      kind: "screening_coverage",
      detail: `Across ${sampled} sampled films we hold ${ourSampledTotal} of their ${theirTotal} screenings for ${today} (${Math.round(sampleCoverage * 100)}%).`,
    });
  }

  if (unknownVenues.size > 0) {
    alerts.push({
      level: "warn",
      kind: "unknown_venue",
      detail: `Venue(s) the source lists that lib/venues does not know, so they have no coordinates and cannot be sorted by distance: ${[...unknownVenues].join(", ")}.`,
    });
  }

  if (sampled === 0) {
    alerts.push({
      level: "alert",
      kind: "no_sample",
      detail: `Sampled no films with screenings (${fetchFailures} fetch failures). Either the source changed shape or it is unreachable.`,
    });
  }

  const severity = alerts.some((a) => a.level === "alert")
    ? "alert"
    : alerts.length > 0
      ? "warn"
      : "ok";

  const perFilmSorted = perFilm.sort(
    (a, b) => a.ours / (a.theirs || 1) - b.ours / (b.theirs || 1),
  );

  /**
   * Every run mails by default, which is what was asked for.
   *
   * `?alertsOnly=1` on the cron (or COVERAGE_ALERT_ONLY=1) switches to sending
   * only when something is wrong. Worth knowing it is there: this fires five
   * times a day, and a report that always says the same thing is the kind that
   * gets filtered into a folder and stops being read — at which point the one
   * that matters is missed too. The subject line carries the verdict so a
   * healthy run is a two-second glance, but if it does start feeling like
   * noise, flip this rather than muting the sender.
   */
  const alertsOnly =
    url.searchParams.get("alertsOnly") === "1" || process.env["COVERAGE_ALERT_ONLY"] === "1";

  const summary: Summary = {
    severity,
    day: today,
    sampled,
    titlesPct: Math.round(titleCoverage * 100),
    screeningsPct: Math.round(sampleCoverage * 100),
    activeTitles: ourTitles.size,
    screeningsToday: ourTodayTotal,
    alerts,
    perFilm: perFilmSorted,
  };

  const email =
    alertsOnly && severity === "ok"
      ? { sent: false, note: "suppressed: alertsOnly and nothing to report" }
      : await emailReport(summary);

  return Response.json({
    // ok means the check ran, not that coverage is good. Read `severity`.
    ok: true,
    severity,
    ranAt: new Date().toISOString(),
    day: today,
    source: { sitemapFilms: urls.length, sampled, fetchFailures },
    ours: { activeTitles: ourTitles.size, activeRows: ours.length, screeningsToday: ourTodayTotal },
    coverage: {
      titlesPct: Math.round(titleCoverage * 100),
      sampledScreeningsPct: Math.round(sampleCoverage * 100),
    },
    alerts,
    // Worst-covered first, so the interesting rows are at the top of the log.
    perFilm: perFilmSorted.slice(0, 15),
    // Delivery is reported separately from the check itself: a failed send
    // must be visible without making the run look like the check failed.
    email,
    tookMs: Date.now() - started,
  });
}

export const Route = createFileRoute("/api/public/hooks/coverage-check")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
