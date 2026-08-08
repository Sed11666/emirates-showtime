import { Clock, Star, Ticket } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { MergedFilm } from "@/lib/cinemas";
import { filmFormats } from "@/lib/cinemas";

export type PosterItem = {
  id: string;
  title: string;
  poster: string | null;
  meta: string[];
  rating: string | null;
  duration: number | null;
  /** Screen formats (IMAX, 4DX, 3D, 2D…) shown on the poster. */
  formats: string[];
  tag: string | null;
};

export function filmToPoster(film: MergedFilm): PosterItem {
  return {
    id: film.id,
    title: film.title,
    poster: film.poster_url,
    meta: [film.genre, film.language, film.city].filter(Boolean) as string[],
    rating: film.rating,
    duration: film.duration_mins,
    formats: film.screenFormats ?? filmFormats(film),
    tag: null,
  };
}

/**
 * Poster-first movie card: artwork fills the frame, details slide up out of a
 * dark gradient on hover with a red booking CTA that opens the cinema page
 * with nearby screens listed first.
 */
export function MoviePosterCard({
  item,
  className = "",
  size = "md",
  fullWidth = false,
}: {
  item: PosterItem;
  className?: string;
  size?: "md" | "lg";
  fullWidth?: boolean;
}) {
  const width = fullWidth
    ? "w-full"
    : size === "lg"
      ? "w-[13rem] sm:w-[15.5rem]"
      : "w-[10.5rem] sm:w-[12rem]";
  return (
    <Link
      to="/cinemas"
      search={{ movie: item.title }}
      className={`group relative block shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-poster transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] hover:border-gold/50 hover:red-glow ${width} ${className}`}
    >


      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        {item.poster ? (
          <img
            src={item.poster}
            alt={`${item.title} poster`}
            loading="lazy"
            className="size-full object-cover opacity-90 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {item.title}
          </div>
        )}

        {item.formats.length > 0 ? (
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
            {item.formats.slice(0, 3).map((format) => (
              <span
                key={format}
                className="rounded-md border border-gold/50 bg-background/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold backdrop-blur"
              >
                {format}
              </span>
            ))}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent p-3 pt-14">
          <h3 className="line-clamp-1 text-sm font-semibold">{item.title}</h3>
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {item.meta.join(" · ") || "Details coming soon"}
          </p>

          <div className="grid grid-rows-[0fr] transition-all duration-500 group-hover:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <div className="flex items-center gap-3 pt-2 text-[11px] text-muted-foreground">
                {item.rating ? (
                  <span className="inline-flex items-center gap-1 text-gold">
                    <Star className="size-3 fill-gold text-gold" /> {item.rating}
                  </span>
                ) : null}
                {item.duration ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3 text-primary" /> {item.duration}m
                  </span>
                ) : null}
              </div>
              <span className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all group-hover:brightness-110">
                <Ticket className="size-3.5" /> Book tickets
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>

  );
}
