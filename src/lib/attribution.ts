/**
 * attribution.ts — first-party, anonymous marketing counts.
 *
 * Vercel Web Analytics can't record custom events on the Hobby plan, and the
 * question marketing has to answer is narrow: *which channel sends people who
 * go on to book?* So we count two things ourselves, in our own Supabase:
 *
 *   visit        — once per tab session: where the visitor came from
 *                  (utm_source, else the referring site, else "direct").
 *   booking_tap  — every time chip pressed: film, chain, venue, plus the
 *                  session's source so a tap is credited to its channel.
 *
 * Nothing personal is stored: no IP, no user agent, no account id. The session
 * id is random, lives in sessionStorage and dies with the tab. Bots, headless
 * browsers and admin pages are skipped. Every call is fire-and-forget — a
 * failure here must never touch the page.
 *
 * Tag links we post with utm parameters, e.g.
 *   https://www.showsouk.com/movie/x?utm_source=instagram&utm_medium=social&utm_campaign=wk49
 */
import { supabase } from "@/integrations/supabase/client";

const KEY = "ss_attr_v1";

type Attribution = {
  session_id: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  landing: string;
  device: "mobile" | "desktop";
};

/** Referrer hosts folded into one readable source name. */
const SOURCE_ALIASES: Array<[RegExp, string]> = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\.com$/, "yahoo"],
  [/(^|\.)(instagram\.com|l\.instagram\.com)$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|lm\.facebook\.com)$/, "facebook"],
  [/(^|\.)(tiktok\.com)$/, "tiktok"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "x"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
];

const BOT_RX = /bot|crawl|spider|slurp|lighthouse|headless|pingdom/i;

function isBot(): boolean {
  if (typeof navigator === "undefined") return true;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return true;
  return BOT_RX.test(navigator.userAgent);
}

function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  // Count production only, so previews and local testing never pollute it.
  if (host !== "www.showsouk.com" && host !== "showsouk.com") return true;
  if (window.location.pathname.startsWith("/admin")) return true;
  return isBot();
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function sourceFromReferrer(referrer: string): string {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (host.endsWith("showsouk.com")) return "direct";
  for (const [rx, name] of SOURCE_ALIASES) if (rx.test(host)) return name;
  return host.replace(/^www\./, "");
}

function read(): Attribution | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function send(event: Record<string, string | null | undefined>) {
  // Not awaited and errors swallowed: analytics must never break a page.
  void supabase
    .rpc("log_site_event", { p_event: event })
    .then(() => undefined, () => undefined);
}

/**
 * Called once on the first client render. Records where this session came
 * from and logs the visit. Later calls in the same tab do nothing.
 */
export function initAttribution() {
  if (shouldSkip() || read()) return;
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source")?.trim().toLowerCase();
  const attr: Attribution = {
    session_id: randomId(),
    source: utmSource || sourceFromReferrer(document.referrer),
    medium: params.get("utm_medium")?.trim().toLowerCase() || null,
    campaign: params.get("utm_campaign")?.trim().toLowerCase() || null,
    landing: window.location.pathname,
    device: window.matchMedia?.("(max-width: 767px)").matches ? "mobile" : "desktop",
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(attr));
  } catch {
    return; // storage blocked: skip rather than count every page as a visit
  }
  send({
    kind: "visit",
    session_id: attr.session_id,
    path: attr.landing,
    source: attr.source,
    medium: attr.medium,
    campaign: attr.campaign,
    device: attr.device,
  });
}

/** A booking chip was pressed. */
export function trackBookingTap(film: string, cinema: string, venue: string) {
  if (shouldSkip()) return;
  const attr = read();
  if (!attr) return;
  send({
    kind: "booking_tap",
    session_id: attr.session_id,
    path: window.location.pathname,
    film,
    cinema,
    venue,
    source: attr.source,
    medium: attr.medium,
    campaign: attr.campaign,
    device: attr.device,
  });
}
