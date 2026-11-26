/**
 * share-film.tsx — "Share on WhatsApp" for a film page.
 *
 * WhatsApp is how films get chosen in UAE group chats, so the share goes there
 * directly rather than through a generic share sheet. The link is tagged
 * (utm_source=whatsapp, medium=share) so visits it brings show up as their own
 * line on /admin/marketing, and the press itself is counted as a `share`.
 *
 * wa.me opens the app on phones and WhatsApp Web on desktop. The preview card
 * the recipient sees comes from the page's og:image, which is the poster.
 */
import { MessageCircle } from "lucide-react";

import { trackShare } from "@/lib/attribution";

export function shareText(title: string, slug: string): string {
  const url = `https://www.showsouk.com/movie/${slug}?utm_source=whatsapp&utm_medium=share&utm_campaign=film-share`;
  return `${title}: showtimes at every UAE cinema, nearest first\n${url}`;
}

export function ShareFilmButton({ title, slug }: { title: string; slug: string }) {
  const href = `https://wa.me/?text=${encodeURIComponent(shareText(title, slug))}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackShare(slug, "whatsapp")}
      aria-label={`Share ${title} on WhatsApp`}
      className="cinematic-control ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary-ink/70 hover:text-primary-ink"
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Share on WhatsApp</span>
      <span className="sm:hidden">Share</span>
    </a>
  );
}
