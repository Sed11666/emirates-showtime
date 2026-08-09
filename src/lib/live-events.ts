/**
 * live-events.ts — Read layer for scraped arena events (`live_events` table),
 * populated by src/routes/api/public/hooks/scrape-events.ts (Etihad Arena and
 * Coca-Cola Arena). Note: the /events page currently renders a "Coming Soon"
 * placeholder, so this data is fetched mainly by search.
 */
import { supabase } from "@/integrations/supabase/client";

export type LiveEventSource = "etihad-arena" | "coca-cola-arena";

export const EVENT_SOURCE_LABELS: Record<string, string> = {
  "etihad-arena": "Etihad Arena",
  "coca-cola-arena": "Coca-Cola Arena",
};

export type LiveEvent = {
  id: string;
  source: string;
  title: string;
  city: string | null;
  venue: string | null;
  category: string | null;
  date_text: string | null;
  starts_on: string | null;
  ends_on: string | null;
  image_url: string | null;
  description: string | null;
  price_text: string | null;
  ticket_url: string | null;
  source_url: string | null;
  last_seen_at: string;
};

export async function fetchLiveEvents(): Promise<LiveEvent[]> {
  const { data, error } = await supabase
    .from("live_events")
    .select(
      "id, source, title, city, venue, category, date_text, starts_on, ends_on, image_url, description, price_text, ticket_url, source_url, last_seen_at",
    )
    .eq("is_active", true)
    .order("starts_on", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveEvent[];
}

/** True when the event runs on the given day key (yyyy-mm-dd); undated events always pass. */
export function eventRunsOn(event: LiveEvent, dayKey: string): boolean {
  if (dayKey === "any") return true;
  if (!event.starts_on) return true;
  const end = event.ends_on ?? event.starts_on;
  return event.starts_on <= dayKey && dayKey <= end;
}

export function formatEventDate(event: LiveEvent): string {
  if (event.date_text) return event.date_text;
  if (!event.starts_on) return "Dates to be announced";
  const format = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString("en-AE", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  if (event.ends_on && event.ends_on !== event.starts_on) {
    return `${format(event.starts_on)} – ${format(event.ends_on)}`;
  }
  return format(event.starts_on);
}
