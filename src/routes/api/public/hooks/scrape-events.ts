/**
 * POST/GET /api/public/hooks/scrape-events — Arena events scraper.
 *
 * Same shape as scrape-cinemas.ts but for Etihad Arena (Abu Dhabi) and
 * Coca-Cola Arena (Dubai). Firecrawl extract -> upsert into `live_events`
 * keyed by (source, title_key), stale rows deactivated, each run logged to
 * `event_scrape_runs`. Scheduled roughly every 6 hours via pg_cron.
 */
import { createFileRoute } from "@tanstack/react-router";

type SourceKey = "etihad-arena" | "coca-cola-arena";

const SOURCES: Record<SourceKey, { urls: string[]; venue: string; city: string }> = {
  "etihad-arena": {
    urls: ["https://www.etihadarena.ae/en/events", "https://www.etihadarena.ae/en"],
    venue: "Etihad Arena",
    city: "Abu Dhabi",
  },
  "coca-cola-arena": {
    urls: ["https://www.coca-cola-arena.com/events", "https://www.coca-cola-arena.com/"],
    venue: "Coca-Cola Arena",
    city: "Dubai",
  },
};

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          date_text: { type: "string" },
          starts_on: { type: "string" },
          ends_on: { type: "string" },
          image_url: { type: "string" },
          description: { type: "string" },
          price_text: { type: "string" },
          ticket_url: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  required: ["events"],
} as const;

const EXTRACT_PROMPT =
  "Extract every upcoming live event, concert, comedy show, sporting event or family show listed on this arena page. For each event capture the exact event title, the category/genre (Concert, Comedy, Sport, Family, Theatre, Conference), the date exactly as printed on the page (date_text), the first calendar date in yyyy-mm-dd form (starts_on) and the final date in yyyy-mm-dd form when the event runs over multiple days (ends_on), the event artwork/poster image URL, a one-line description, any printed ticket price information, and the direct ticket/booking link. Only return values that literally appear on the page: never invent titles, dates or prices, and never output placeholder text. If the page lists no events, return an empty array. Ignore navigation links, venue hire pages, news articles and promotions that are not events.";

/** Titles the extractor invents when it echoes prompt/schema examples back. */
const GENERIC_TITLES = new Set([
  "title",
  "name",
  "example",
  "sample",
  "lorem ipsum",
  "n/a",
  "na",
  "tbd",
  "untitled",
  "movie",
  "film",
  "event",
]);

function isPlaceholderTitle(raw: string | undefined): boolean {
  const value = raw?.trim() ?? "";
  if (value.length < 2) return true;
  const lower = value.toLowerCase();
  if (GENERIC_TITLES.has(lower)) return true;
  if (/^\d+([.,]\d+)?$/.test(lower)) return true;
  if (/^(film|movie|event)\s*(title)?\s*\d*$/i.test(lower)) return true;
  return false;
}


type RawEvent = {
  title?: string;
  category?: string;
  date_text?: string;
  starts_on?: string;
  ends_on?: string;
  image_url?: string;
  description?: string;
  price_text?: string;
  ticket_url?: string;
};

function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PRICE_NOISE = /^(find tickets?|buy tickets?|get tickets?|book now|more info|register now|coming soon|tickets?|sold out|on sale.*)$/i;

/** Arena pages put CTA labels where a price should be — drop those. */
function cleanPrice(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed || PRICE_NOISE.test(trimmed)) return null;
  return trimmed;
}

function isoDate(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function absoluteUrl(value: string | undefined, base: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function firecrawlScrape(url: string, lovableKey: string, firecrawlKey: string) {
  const response = await fetch("https://connector-gateway.lovable.dev/firecrawl/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": firecrawlKey,
    },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      waitFor: 5000,
      location: { country: "AE", languages: ["en"] },
      formats: ["markdown", { type: "json", schema: EXTRACT_SCHEMA, prompt: EXTRACT_PROMPT }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Firecrawl request failed [${response.status}]: ${text.slice(0, 500)}`);
  }
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const payload = (parsed["data"] ?? parsed) as Record<string, unknown>;
  const markdown = typeof payload["markdown"] === "string" ? (payload["markdown"] as string) : "";
  const json = (payload["json"] ?? {}) as { events?: RawEvent[] };
  return { markdown, events: Array.isArray(json.events) ? json.events : [] };
}

async function scrapeSource(source: SourceKey, force: boolean, lovableKey: string, firecrawlKey: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const config = SOURCES[source];
  const runStartedAt = new Date().toISOString();

  // Safety baseline: active events before the run, used by the yield and
  // deactivation guards so one bad extraction can never empty a source.
  const { count: activeBefore } = await supabaseAdmin
    .from("live_events")
    .select("id", { count: "exact", head: true })
    .eq("source", source)
    .eq("is_active", true);
  const beforeCount = activeBefore ?? 0;


  let lastError: unknown = null;
  for (const url of config.urls) {
    try {
      const { markdown, events } = await firecrawlScrape(url, lovableKey, firecrawlKey);
      const contentHash = await sha256(markdown || JSON.stringify(events));

      const { data: previous } = await supabaseAdmin
        .from("event_scrape_runs")
        .select("content_hash")
        .eq("source", source)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!force && previous?.content_hash && previous.content_hash === contentHash) {
        await supabaseAdmin
          .from("live_events")
          .update({ last_seen_at: runStartedAt })
          .eq("source", source)
          .eq("is_active", true);
        await supabaseAdmin.from("event_scrape_runs").insert({
          source,
          source_url: url,
          content_hash: contentHash,
          changed: false,
          status: "success",
        });
        return { source, changed: false, upserted: 0, deactivated: 0, sourceUrl: url };
      }

      const rows = events
        .filter((event) => typeof event.title === "string" && !isPlaceholderTitle(event.title))

        .map((event) => ({
          source,
          title: event.title!.trim(),
          title_key: titleKey(event.title!),
          city: config.city,
          venue: config.venue,
          category: event.category?.trim() || null,
          date_text: event.date_text?.trim() || null,
          starts_on: isoDate(event.starts_on),
          ends_on: isoDate(event.ends_on),
          image_url: absoluteUrl(event.image_url, url),
          description: event.description?.trim() || null,
          price_text: cleanPrice(event.price_text),
          ticket_url: absoluteUrl(event.ticket_url, url),
          source_url: url,
          is_active: true,
          last_seen_at: runStartedAt,
        }));

      if (rows.length === 0) {
        throw new Error(
          `no usable events extracted from ${url} (all ${events.length} extracted item(s) were empty or placeholder text)`,
        );
      }

      const unique = new Map<string, (typeof rows)[number]>();
      for (const row of rows) unique.set(row.title_key, row);

      // Minimum plausible yield — a big drop means a broken scrape, not a quiet day.
      if (beforeCount >= 4 && unique.size < beforeCount * 0.5) {
        throw new Error(
          `minimum yield guard: ${source} extraction returned ${unique.size} event(s) but ${beforeCount} were active before the run (needs at least ${Math.ceil(beforeCount * 0.5)})`,
        );
      }

      const { error: upsertError } = await supabaseAdmin
        .from("live_events")
        .upsert([...unique.values()], { onConflict: "source,title_key" });
      if (upsertError) throw new Error(upsertError.message);

      // Never let one run retire more than 30% of a source's catalogue.
      const { data: candidates } = await supabaseAdmin
        .from("live_events")
        .select("id")
        .eq("source", source)
        .eq("is_active", true)
        .lt("last_seen_at", runStartedAt);
      const staleCount = candidates?.length ?? 0;

      if (staleCount > 0 && beforeCount > 0 && staleCount > beforeCount * 0.3) {
        const message = `deactivation cap: would deactivate ${staleCount} of ${beforeCount} active ${source} events (limit 30%) — deactivation skipped, all rows left active`;
        console.error(`[scrape-events] ${message}`);
        await supabaseAdmin.from("event_scrape_runs").insert({
          source,
          source_url: url,
          content_hash: contentHash,
          changed: true,
          events_upserted: unique.size,
          events_deactivated: 0,
          status: "error",
          error: message,
        });
        return {
          source,
          changed: true,
          upserted: unique.size,
          deactivated: 0,
          sourceUrl: url,
          error: message,
        };
      }

      const { data: removed } = await supabaseAdmin
        .from("live_events")
        .update({ is_active: false })
        .eq("source", source)
        .eq("is_active", true)
        .lt("last_seen_at", runStartedAt)
        .select("id");


      await supabaseAdmin.from("event_scrape_runs").insert({
        source,
        source_url: url,
        content_hash: contentHash,
        changed: true,
        events_upserted: unique.size,
        events_deactivated: removed?.length ?? 0,
        status: "success",
      });

      return {
        source,
        changed: true,
        upserted: unique.size,
        deactivated: removed?.length ?? 0,
        sourceUrl: url,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[scrape-events] ${source} failed:`, message);
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  await admin.from("event_scrape_runs").insert({
    source,
    status: "error",
    error: message.slice(0, 1000),
  });
  return { source, changed: false, upserted: 0, deactivated: 0, error: message };
}

async function runScrape(request: Request) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !firecrawlKey) {
    return Response.json({ error: "Scraper credentials are not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("source");
  const force = url.searchParams.get("force") === "1";
  const keys = (Object.keys(SOURCES) as SourceKey[]).filter((key) => !requested || key === requested);
  if (keys.length === 0) return Response.json({ error: "Unknown source" }, { status: 400 });

  const results = await Promise.all(
    keys.map((key) => scrapeSource(key, force, lovableKey, firecrawlKey)),
  );

  return Response.json({ ok: true, ranAt: new Date().toISOString(), results });
}

export const Route = createFileRoute("/api/public/hooks/scrape-events")({
  server: {
    handlers: {
      POST: async ({ request }) => runScrape(request),
      GET: async ({ request }) => runScrape(request),
    },
  },
});
