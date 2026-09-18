/**
 * GET/POST /api/public/hooks/seo-audit — crawls our own landing pages and
 * records an SEO health snapshot for the admin dashboard.
 *
 * Why crawl rather than inspect the source: a head() that looks right in the
 * repo proves nothing about what the deployed page serves. The only evidence
 * that matters is the HTML Google would receive, so this fetches the live
 * origin exactly as a crawler would.
 *
 * The URL list comes from lib/seo-audit.ts — the same list /sitemap.xml is
 * built from — plus the sitemap itself, so a page that exists but never made
 * it into the sitemap shows up as an issue instead of silently vanishing.
 *
 * Writes go through the `ingest_seo_audit` SECURITY DEFINER function using the
 * publishable key plus the existing scraper ingest token; Lovable Cloud never
 * exposes a service-role key, and this needs a far smaller blast radius anyway.
 *
 * Parsing is regex against server-rendered HTML, matching the approach the
 * cinema scraper already uses. No DOM library runs in the Worker runtime.
 */
import { createFileRoute } from "@tanstack/react-router";

import { SITE_ORIGIN, allTargets, type SeoTarget } from "@/lib/seo-audit";

const UA = "ShowSoukSeoAudit/1.0 (+https://www.showsouk.com)";

/** Fetch concurrency. Small on purpose: this crawls our own origin. */
const BATCH = 6;
/** Per-request timeout. A page slower than this is a finding, not a hang. */
const REQUEST_TIMEOUT_MS = 12_000;
/** Whole-run wall clock budget, well inside the platform's request ceiling. */
const BUDGET_MS = 55_000;

/** Google truncates titles past ~60 chars and ignores very short ones. */
const TITLE_MIN = 15;
const TITLE_MAX = 65;
const DESC_MIN = 70;
const DESC_MAX = 160;

type PageCheck = {
  path: string;
  tier: string;
  status_code: number | null;
  response_ms: number | null;
  title: string | null;
  title_len: number;
  description: string | null;
  description_len: number;
  canonical: string | null;
  canonical_ok: boolean;
  h1_count: number;
  jsonld_types: string[];
  in_sitemap: boolean;
  issues: string[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m?.[1] ? decodeEntities(m[1]) : null;
}

/** Collect every "@type" value across all JSON-LD blocks on the page. */
function jsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const raw = block[1];
    if (!raw) continue;
    try {
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        const rec = node as Record<string, unknown>;
        const t = rec["@type"];
        if (typeof t === "string") types.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
        Object.values(rec).forEach(walk);
      };
      walk(JSON.parse(raw));
    } catch {
      types.add("(unparseable)");
    }
  }
  return [...types];
}

/** "https://www.showsouk.com/cinemas/vox" and "/cinemas/vox/" both mean the same page. */
function normalizePath(value: string): string {
  let path = value;
  try {
    if (/^https?:\/\//i.test(value)) path = new URL(value).pathname;
  } catch {
    return value;
  }
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

async function fetchPage(target: SeoTarget, sitemapPaths: Set<string>): Promise<PageCheck> {
  const url = SITE_ORIGIN + target.path;
  const started = Date.now();
  const check: PageCheck = {
    path: target.path,
    tier: target.tier,
    status_code: null,
    response_ms: null,
    title: null,
    title_len: 0,
    description: null,
    description_len: 0,
    canonical: null,
    canonical_ok: false,
    h1_count: 0,
    jsonld_types: [],
    in_sitemap: sitemapPaths.has(normalizePath(target.path)),
    issues: [],
  };

  let html = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    check.status_code = res.status;
    html = await res.text();
  } catch {
    check.status_code = 0;
    check.response_ms = Date.now() - started;
    check.issues.push("Page could not be fetched");
    if (!check.in_sitemap) check.issues.push("Missing from sitemap");
    return check;
  }
  check.response_ms = Date.now() - started;

  if (check.status_code !== 200) {
    check.issues.push(`Returned HTTP ${check.status_code}`);
  }

  check.title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  check.title_len = check.title?.length ?? 0;
  check.description = firstMatch(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  check.description_len = check.description?.length ?? 0;
  const canonicalRaw = firstMatch(
    html,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i,
  );
  check.canonical = canonicalRaw;
  check.canonical_ok =
    !!canonicalRaw && normalizePath(canonicalRaw) === normalizePath(target.path);
  check.h1_count = [...html.matchAll(/<h1[\s>]/gi)].length;
  check.jsonld_types = jsonLdTypes(html);

  if (!check.title) check.issues.push("Missing title");
  else if (check.title_len < TITLE_MIN) check.issues.push("Title too short");
  else if (check.title_len > TITLE_MAX) check.issues.push("Title too long");

  if (!check.description) check.issues.push("Missing description");
  else if (check.description_len < DESC_MIN) check.issues.push("Description too short");
  else if (check.description_len > DESC_MAX) check.issues.push("Description too long");

  if (!canonicalRaw) check.issues.push("Missing canonical");
  else if (!check.canonical_ok) check.issues.push("Canonical points elsewhere");

  if (check.h1_count === 0) check.issues.push("No H1 heading");
  else if (check.h1_count > 1) check.issues.push(`${check.h1_count} H1 headings`);

  if (check.jsonld_types.length === 0) check.issues.push("No structured data");
  else if (check.jsonld_types.includes("(unparseable)")) {
    check.issues.push("Structured data is not valid JSON");
  }

  if (!check.in_sitemap) check.issues.push("Missing from sitemap");

  return check;
}

async function readSitemap(): Promise<{ paths: Set<string>; count: number; ok: boolean }> {
  try {
    const res = await fetch(`${SITE_ORIGIN}/sitemap.xml`, { headers: { "user-agent": UA } });
    if (!res.ok) return { paths: new Set(), count: 0, ok: false };
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => normalizePath(m[1]!.trim()));
    return { paths: new Set(locs), count: locs.length, ok: true };
  } catch {
    return { paths: new Set(), count: 0, ok: false };
  }
}

async function runAudit(request: Request) {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + BUDGET_MS;

  const SUPABASE_URL = import.meta.env?.["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const SUPABASE_KEY =
    import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"];
  const INGEST_TOKEN = process.env["SCRAPER_INGEST_TOKEN"];
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ ok: false, error: "Supabase config missing" }, { status: 500 });
  }
  if (!INGEST_TOKEN) {
    return Response.json(
      { ok: false, error: "SCRAPER_INGEST_TOKEN is not configured" },
      { status: 500 },
    );
  }

  const trigger = new URL(request.url).searchParams.get("trigger") === "manual" ? "manual" : "cron";

  const notes: string[] = [];
  const sitemap = await readSitemap();
  if (!sitemap.ok) notes.push("sitemap.xml could not be read");

  const { targets, catalogueOk } = await allTargets();
  if (!catalogueOk) notes.push("film catalogue unavailable; only static pages were checked");

  const checks: PageCheck[] = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    if (Date.now() > deadline) {
      notes.push(`time budget reached after ${checks.length} of ${targets.length} pages`);
      break;
    }
    const slice = targets.slice(i, i + BATCH);
    checks.push(...(await Promise.all(slice.map((t) => fetchPage(t, sitemap.paths)))));
  }

  // Pages the sitemap lists but our own target list does not know about. They
  // are stale entries, and a stale sitemap URL is a crawl-budget leak.
  const known = new Set(targets.map((t) => normalizePath(t.path)));
  for (const path of sitemap.paths) {
    if (known.has(path)) continue;
    checks.push({
      path,
      tier: "other",
      status_code: null,
      response_ms: null,
      title: null,
      title_len: 0,
      description: null,
      description_len: 0,
      canonical: null,
      canonical_ok: false,
      h1_count: 0,
      jsonld_types: [],
      in_sitemap: true,
      issues: ["In sitemap but not a known landing page"],
    });
  }

  const failing = checks.filter((c) => c.issues.length > 0).length;
  const score = checks.length ? Math.round(((checks.length - failing) / checks.length) * 100) : 0;
  const status = checks.length === 0 ? "error" : failing > 0 ? "warning" : "success";
  if (checks.length === 0) notes.push("no pages were checked");

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("ingest_seo_audit", {
    p_token: INGEST_TOKEN,
    p_run: {
      started_at: startedAt,
      status,
      trigger,
      pages_checked: checks.length,
      pages_failing: failing,
      score,
      sitemap_url_count: sitemap.count,
      notes: notes.join("; ") || null,
    },
    p_rows: checks,
  });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    run: data,
    pages_checked: checks.length,
    pages_failing: failing,
    score,
    status,
    notes,
  });
}

export const Route = createFileRoute("/api/public/hooks/seo-audit")({
  server: {
    handlers: {
      GET: async ({ request }) => runAudit(request),
      POST: async ({ request }) => runAudit(request),
    },
  },
});
