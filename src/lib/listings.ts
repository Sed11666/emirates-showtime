/**
 * listings.ts — Manually curated entries (`listings` table).
 *
 * These are admin-authored movies/events added from /admin. Writes are locked
 * down by RLS to users holding the 'admin' role (see hooks/useIsAdmin).
 * Scraped content lives elsewhere: lib/cinemas.ts and lib/live-events.ts.
 */
import { supabase } from "@/integrations/supabase/client";

export type ListingKind = "movie" | "event";

export type Listing = {
  id: string;
  kind: ListingKind;
  title: string;
  description: string | null;
  poster_url: string | null;
  genre: string | null;
  language: string | null;
  venue: string | null;
  city: string;
  price_aed: number;
  starts_at: string | null;
  duration_mins: number | null;
  certification: string | null;
  featured: boolean;
  created_by: string | null;
  created_at: string;
};

export const UAE_CITIES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
  "Al Ain",
] as const;

export async function fetchListings(kind?: ListingKind): Promise<Listing[]> {
  let query = supabase.from("listings").select("*").order("starts_at", { ascending: true });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Listing[];
}

export async function fetchListing(id: string): Promise<Listing | null> {
  const { data, error } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Listing) ?? null;
}

export function formatAED(value: number) {
  return value > 0 ? `AED ${Number(value).toFixed(0)}` : "Free entry";
}

export function formatWhen(value: string | null) {
  if (!value) return "Dates to be announced";
  return new Date(value).toLocaleString("en-AE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
