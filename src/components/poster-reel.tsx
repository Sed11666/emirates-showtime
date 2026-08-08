import { useMemo } from "react";

type Row = {
  posters: string[];
  duration: number;
  reverse: boolean;
  scale: number;
  blur: number;
  opacity: number;
};

/**
 * Endless cinema-reel background: multiple overlapping poster rows scrolling
 * in alternating directions at different speeds, layered under a heavy
 * cinematic gradient so foreground content stays readable.
 */
export function PosterReel({ posters }: { posters: string[] }) {
  const rows = useMemo<Row[]>(() => {
    const pool = posters.filter(Boolean);
    if (pool.length === 0) return [];
    const rotate = (offset: number) => {
      const shifted = [...pool.slice(offset % pool.length), ...pool.slice(0, offset % pool.length)];
      // Ensure each row is long enough that the 50% loop never shows a gap.
      const out: string[] = [];
      while (out.length < Math.max(10, pool.length)) out.push(...shifted);
      return out;
    };
    return [
      { posters: rotate(0), duration: 90, reverse: false, scale: 0.82, blur: 3, opacity: 0.4 },
      { posters: rotate(3), duration: 62, reverse: true, scale: 1, blur: 0, opacity: 0.75 },
      { posters: rotate(6), duration: 110, reverse: false, scale: 0.72, blur: 5, opacity: 0.28 },
    ];
  }, [posters]);

  if (rows.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="poster-reel-mask absolute inset-0 -top-10 flex flex-col justify-center gap-3">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`poster-reel-track ${row.reverse ? "poster-reel-reverse" : ""} gap-4`}
            style={{
              animationDuration: `${row.duration}s`,
              filter: row.blur ? `blur(${row.blur}px)` : undefined,
              opacity: row.opacity,
              transform: `scale(${row.scale})`,
            }}
          >
            {[...row.posters, ...row.posters].map((src, i) => (
              <div
                key={`${rowIndex}-${i}`}
                className="pointer-events-auto h-40 w-[7.5rem] shrink-0 overflow-hidden rounded-xl border border-border/40 shadow-poster transition-all duration-500 hover:scale-105 hover:opacity-100 sm:h-56 sm:w-[10.5rem]"
                style={{ marginTop: (i % 3) * 6 }}
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Cinematic darkening: gradient wash, vignette, fade into page background */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.12_0.015_40/0.92)_0%,oklch(0.14_0.015_40/0.72)_45%,oklch(0.17_0.018_40/0.98)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_45%,transparent_0%,oklch(0.1_0.01_40/0.55)_70%,oklch(0.1_0.01_40/0.92)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      <div className="absolute inset-0 backdrop-blur-[1.5px]" />
    </div>
  );
}
