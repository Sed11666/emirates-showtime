import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CATEGORY_META, ResultRow, useShowSoukSearch } from "@/components/search-overlay";

type Tab = "all" | "movies" | "events" | "cinemas";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? (search["q"] as string) : "",
    tab: (["all", "movies", "events", "cinemas"] as const).includes(search["tab"] as Tab)
      ? (search["tab"] as Tab)
      : ("all" as Tab),
  }),
  head: () => ({
    meta: [
      { title: "Search Movies, Cinemas & Events | ShowSouk" },
      {
        name: "description",
        content:
          "Search everything listed on ShowSouk — films now showing in UAE cinemas, live arena events and cinema locations near you.",
      },
      { property: "og:title", content: "Search ShowSouk" },
      {
        property: "og:description",
        content: "Find movies, events and cinemas listed on ShowSouk across the UAE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q, tab } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState(q);
  const { data, isFetching, debounced } = useShowSoukSearch(query);

  useEffect(() => {
    setQuery(q);
  }, [q]);

  useEffect(() => {
    if (debounced !== q) {
      navigate({ to: "/search", search: { q: debounced, tab }, replace: true });
    }
  }, [debounced, q, tab, navigate]);

  const groups = (["movies", "events", "cinemas"] as const)
    .filter((key) => tab === "all" || tab === key)
    .map((key) => ({ key, items: data?.[key] ?? [] }))
    .filter((group) => group.items.length > 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="font-display text-3xl font-bold">
        Search <span className="text-gold-gradient">ShowSouk</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Results come only from movies, events and cinemas listed on ShowSouk.
      </p>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movies, cinemas & events"
        className="mt-6 max-w-xl"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", "movies", "events", "cinemas"] as const).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "default" : "outline"}
            onClick={() => navigate({ to: "/search", search: { q: query.trim(), tab: key } })}
          >
            {key === "all" ? "All" : CATEGORY_META[key].label}
          </Button>
        ))}
      </div>

      <div className="mt-8 space-y-8">
        {debounced.length < 2 ? (
          <p className="text-sm text-muted-foreground">Type at least two letters to search.</p>
        ) : groups.length === 0 ? (
          <div>
            <p className="font-medium">
              {isFetching ? "Searching…" : `No results found for "${debounced}"`}
            </p>
            {!isFetching ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Try searching our movies, cinemas or events.
              </p>
            ) : null}
          </div>
        ) : (
          groups.map(({ key, items }) => {
            const { label, icon: Icon } = CATEGORY_META[key];
            return (
              <section key={key}>
                <h2 className="flex items-center gap-2 text-xs uppercase tracking-widest text-gold">
                  <Icon className="size-4" /> {label}
                </h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {items.map((item) => (
                    <ResultRow key={`${item.category}-${item.id}`} result={item} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
