/**
 * film-ratings.tsx — critic scores on the film page.
 *
 * Three sources, each shown only when we have it, in the order people trust
 * them for a cinema decision: IMDb first because it is the one most visitors
 * recognise, then Rotten Tomatoes, then Metacritic.
 *
 * Deliberately plain. The reference implementation renders these as coloured
 * badges competing with the title; here they sit on the spec line's row as
 * quiet text with the source named, because on this site the loudest thing on
 * a film page should be the showtimes. A score nobody can source is worse than
 * no score, so the label is never dropped to save space.
 *
 * Vote count is abbreviated ("67K") rather than exact: the precision is noise
 * at a glance, and it is stale the moment we store it.
 */

export type FilmRatings = {
  imdbRating: number | null;
  rtScore: number | null;
};

export function FilmRatings({ ratings }: { ratings: FilmRatings }) {
  const { imdbRating, rtScore } = ratings;
  if (imdbRating === null && rtScore === null) return null;

  return (
    <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      {imdbRating !== null ? (
        <div className="flex items-baseline gap-1.5">
          {/* Not uppercased, unlike its neighbours: the brand is "IMDb" with a
              lowercase b, and text-transform would render it "IMDB". */}
          <dt className="text-xs font-semibold tracking-wide text-gold">IMDb</dt>
          <dd className="font-semibold text-foreground">
            {imdbRating.toFixed(1)}
            <span className="font-normal text-muted-foreground">/10</span>
          </dd>
        </div>
      ) : null}

      {rtScore !== null ? (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rotten Tomatoes
          </dt>
          <dd className="font-semibold text-foreground">{rtScore}%</dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * One billed performer.
 *
 * `character` and `profile` are both optional and both genuinely absent a lot:
 * TMDB has no headshot for much of the Malayalam, Tamil and Arabic catalogue,
 * which is a large share of what plays here. The row has to look deliberate
 * when every photo is missing, not like a broken gallery — hence the initials
 * fallback rather than a grey box or a generic silhouette.
 */
export type CastCredit = {
  name: string;
  character?: string | null;
  /** Full TMDB URL, already sized by the resolver. */
  profile?: string | null;
};

/** "Jason Statham" → "JS". Single names give one letter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Billed cast, with the role where we know it.
 *
 * Reads "Jason Statham as Cole Reed" rather than a bare list, because the role
 * is what makes the name useful to someone deciding — plenty of people know a
 * character and not the actor. Falls back to the plain name when TMDB has no
 * character, which happens on documentaries and some Malayalam and Arabic
 * titles, so the line must not assume the word "as" is always earned.
 */
/**
 * The director, inline beside the synopsis.
 *
 * Kept out of the portrait row on purpose: one name does not earn a headshot,
 * and giving it one makes the crew compete with the cast for the same glance.
 * The label is visible where the spec line above hides them — "Action"
 * announces itself as a genre, a name does not announce what it did.
 */
export function FilmDirector({ director }: { director: string | null }) {
  if (!director) return null;
  return (
    // Muted label, emphasised value — the same split the ratings row above uses
    // ("ROTTEN TOMATOES" quiet, "71%" bright) and the cast names below. The
    // whole line used to be muted, which made the one proper noun on it the
    // dimmest text in the block.
    <dl className="mt-3 flex gap-2 text-[0.8125rem] leading-relaxed sm:text-sm">
      <dt className="shrink-0 text-muted-foreground">Director</dt>
      <dd className="min-w-0 font-semibold text-foreground">{director}</dd>
    </dl>
  );
}

/**
 * The billed cast, as a horizontally scrolling row of portraits.
 *
 * Scroll rather than wrap, and the row is deliberately allowed to run past the
 * right edge: a half-visible face is the only honest affordance that there is
 * more to see, and it costs no chrome. `snap-x` makes a flick land on a face
 * instead of between two.
 *
 * Touch scrolling needs `touch-pan-x` here for the same reason the hero needed
 * `touch-pan-y` — declaring the axis we handle stops the browser guessing, and
 * a horizontal drag inside a vertically scrolling page is exactly where that
 * guess goes wrong.
 */
export function FilmCast({ cast }: { cast: CastCredit[] }) {
  if (cast.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="cast-heading">
      <h2
        id="cast-heading"
        className="mb-3 font-display text-base font-bold uppercase tracking-wide text-foreground"
      >
        Cast
      </h2>
      {/* -mx-4 px-4 lets the row bleed to the screen edge on a phone, so the
          last visible face is cut by the viewport rather than by padding —
          which is what makes it read as scrollable.

          scroll-px-4 is not decoration. Without it the snap port starts at the
          border edge, so `snap-start` on the first item snapped the container
          to scrollLeft: 16 on load — quietly eating the left padding and
          leaving the first face flush against the screen while the heading
          above it sat indented. Scroll padding tells snapping where the
          content actually begins. */}
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 touch-pan-x sm:gap-5">
        {cast.map((credit, i) => (
          <li
            key={`${credit.name}-${i}`}
            className="w-[4.5rem] shrink-0 snap-start text-center sm:w-20"
          >
            {credit.profile ? (
              <img
                src={credit.profile}
                alt={credit.name}
                loading="lazy"
                draggable={false}
                className="mx-auto size-[4.5rem] rounded-full border border-border/60 object-cover object-top sm:size-20"
              />
            ) : (
              <span
                aria-hidden="true"
                className="mx-auto flex size-[4.5rem] items-center justify-center rounded-full border border-border/60 bg-card/60 text-sm font-semibold text-muted-foreground sm:size-20"
              >
                {initials(credit.name)}
              </span>
            )}
            <p className="mt-2 line-clamp-2 text-[11px] font-semibold leading-tight text-foreground/90 sm:text-xs">
              {credit.name}
            </p>
            {credit.character ? (
              <p className="line-clamp-1 text-[10px] italic leading-tight text-muted-foreground sm:text-[11px]">
                {credit.character}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
