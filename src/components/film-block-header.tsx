/**
 * film-block-header.tsx — the strip above a film's showtimes.
 *
 * Four surfaces show the same block: the /cinemas board, the chain page, the
 * venue page and the city page. They had drifted into two looks — the board
 * had the film icon, an uppercase display title and gold pills, while the three
 * landing pages had a plain semibold title with "Action · 15+" in muted grey
 * off to the right. Same information, two designs, and no reason for it.
 *
 * So it lives here once. The surfaces differ only in what they pass:
 *
 *   /cinemas       certificate and distance, plus an "All times" link
 *   chain / city   genre and certificate, title links to the film page
 *   venue          the same, on a card with no venue column
 *
 * `heading` exists because the difference between them is semantic, not
 * cosmetic: the landing pages are one-heading-per-film documents a crawler
 * reads as an outline, while the board is a filtered list where 40 h2s would
 * be noise.
 */
import { Link } from "@tanstack/react-router";
import { Film } from "lucide-react";
import type { ReactNode } from "react";

export function FilmBlockHeader({
  title,
  slug,
  badges,
  trailing,
  heading = false,
}: {
  title: string;
  /** When set, the title links through to that film's page. */
  slug?: string;
  /** Short facts shown as gold pills. Falsy entries are dropped. */
  badges?: Array<string | null | undefined>;
  /** Rendered at the far end — the "All times" link on the board. */
  trailing?: ReactNode;
  heading?: boolean;
}) {
  const Title = heading ? "h2" : "p";
  const pills = (badges ?? []).filter((b): b is string => Boolean(b));

  return (
    // Stacks on a phone. As one row the title is the only flexible item, so it
    // absorbs whatever the badges and the trailing link need and truncates —
    // hiding the one piece of information the block is about.
    <div className="flex flex-col gap-2 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <Film className="size-4 shrink-0 text-gold" />
        <Title className="min-w-0 font-display text-base font-bold uppercase leading-snug tracking-wide">
          {slug ? (
            <Link to="/movie/$slug" params={{ slug }} className="hover:text-gold">
              {title}
            </Link>
          ) : (
            title
          )}
        </Title>
        {pills.map((text) => (
          <span
            key={text}
            className="shrink-0 rounded-md border border-gold/50 px-1.5 py-0.5 text-[10px] font-semibold text-gold"
          >
            {text}
          </span>
        ))}
      </div>
      {trailing}
    </div>
  );
}
