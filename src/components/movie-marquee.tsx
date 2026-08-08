import { MoviePosterCard, type PosterItem } from "@/components/movie-poster-card";

/**
 * Signature cinema marquee: one continuous right → left reel of posters.
 * The track holds the list twice and translates exactly -50%, so the loop
 * never shows a seam.
 */
export function MovieMarquee({
  items,
  duration = 70,
  size = "lg",
}: {
  items: PosterItem[];
  duration?: number;
  size?: "md" | "lg";
}) {
  if (items.length === 0) return null;
  // Pad short lists so the reel always overflows the viewport.
  const filled: PosterItem[] = [];
  while (filled.length < Math.max(10, items.length)) filled.push(...items);

  return (
    <div className="marquee-edges group/marquee relative overflow-hidden py-2">
      <div aria-hidden className="marquee-lights pointer-events-none absolute inset-0" />
      <div
        className="marquee-track relative gap-5 hover:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >

        {[...filled, ...filled].map((item, i) => (
          <MoviePosterCard key={`${item.id}-${i}`} item={item} size={size} />
        ))}
      </div>
    </div>
  );
}
