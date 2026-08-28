/**
 * search-overlay.tsx — Premium search dropdown opened from the header icon.
 *
 * Debounced queries hit lib/search.ts (our own data only) and render grouped
 * Movies / Events / Cinemas results. Enter navigates to /search?q=QUERY.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Film, Search, Sparkles, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { searchShowSouk, type SearchResult } from "@/lib/search";

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useShowSoukSearch(query: string) {
  const debounced = useDebounced(query.trim(), 250);
  return {
    debounced,
    ...useQuery({
      queryKey: ["showsouk-search", debounced.toLowerCase()],
      queryFn: () => searchShowSouk(debounced),
      enabled: debounced.length >= 2,
      staleTime: 30_000,
    }),
  };
}

export const CATEGORY_META = {
  movies: { label: "Movies", icon: Film },
  events: { label: "Events", icon: Sparkles },
  cinemas: { label: "Cinemas", icon: Clapperboard },
} as const;

export function ResultRow({ result, onNavigate }: { result: SearchResult; onNavigate?: () => void }) {
  const rowClass =
    "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-gold/40 hover:bg-accent/50";

  const body = (
    <>
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {result.imageUrl ? (
          <img
            src={result.imageUrl}
            alt={`${result.title} poster`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Clapperboard className="size-4" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{result.title}</p>
        <p className="truncate text-xs text-primary">{result.subtitle}</p>
        {result.meta ? (
          <p className="truncate text-xs text-muted-foreground">{result.meta}</p>
        ) : null}
      </div>
    </>
  );

  /**
   * One Link per route rather than a spread union.
   *
   * The union form could not survive exactOptionalPropertyTypes once routes
   * with params and routes without were mixed — and it was also where the bug
   * lived: the cinema branch returned a bare { to: "/cinemas" } and silently
   * discarded params identifying the exact screen, so every cinema result
   * opened the unfiltered board. Written out, a branch cannot forget them.
   */
  const shared = { onClick: onNavigate, className: rowClass };

  if (result.to === "/listing/$id") {
    return (
      <Link to="/listing/$id" params={result.params as { id: string }} {...shared}>
        {body}
      </Link>
    );
  }
  if (result.to === "/movie/$slug") {
    return (
      <Link to="/movie/$slug" params={result.params as { slug: string }} {...shared}>
        {body}
      </Link>
    );
  }
  if (result.to === "/cinemas/$chain") {
    return (
      <Link to="/cinemas/$chain" params={result.params as { chain: string }} {...shared}>
        {body}
      </Link>
    );
  }
  if (result.to === "/cinemas/$chain/$venue") {
    return (
      <Link
        to="/cinemas/$chain/$venue"
        params={result.params as { chain: string; venue: string }}
        {...shared}
      >
        {body}
      </Link>
    );
  }
  if (result.to === "/cinemas") {
    return (
      <Link to="/cinemas" {...shared}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/events" {...shared}>
      {body}
    </Link>
  );
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isFetching, debounced } = useShowSoukSearch(query);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else setQuery("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = useMemo(
    () =>
      (["movies", "events", "cinemas"] as const)
        .map((key) => ({ key, items: data?.[key] ?? [] }))
        .filter((group) => group.items.length > 0),
    [data],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      <div className="relative mx-auto mt-24 w-[min(44rem,92vw)] overflow-hidden rounded-2xl border border-gold/25 bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Search className="size-4 text-primary" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                onClose();
                navigate({ to: "/search", search: { q: query.trim(), tab: "all" } });
              }
            }}
            placeholder="Search movies, cinemas & events"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          {debounced.length < 2 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Start typing to search everything listed on ShowSouk.
            </p>
          ) : groups.length === 0 ? (
            <div className="px-3 py-6">
              <p className="text-sm font-medium">
                {isFetching ? "Searching…" : `No results found for "${debounced}"`}
              </p>
              {!isFetching ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Try searching our movies, cinemas or events.
                </p>
              ) : null}
            </div>
          ) : (
            groups.map(({ key, items }) => {
              const { label, icon: Icon } = CATEGORY_META[key];
              return (
                <section key={key} className="mb-3">
                  <p className="flex items-center gap-1.5 px-3 py-1 text-xs uppercase tracking-widest text-gold">
                    <Icon className="size-3.5" /> {label}
                  </p>
                  {items.slice(0, 5).map((item) => (
                    <ResultRow key={`${item.category}-${item.id}`} result={item} onNavigate={onClose} />
                  ))}
                </section>
              );
            })
          )}
        </div>

        {query.trim() ? (
          <button
            onClick={() => {
              onClose();
              navigate({ to: "/search", search: { q: query.trim(), tab: "all" } });
            }}
            className="w-full border-t border-border/70 px-4 py-3 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            Press Enter to see all results for “{query.trim()}”
          </button>
        ) : null}
      </div>
    </div>
  );
}
